"""Fabrique les photos de test de l'import (tests/fixtures/photos/).

Usage : python3 tests/fixtures/photos/make-fixtures.py
Les fichiers HEIC demandent pillow-heif (pip install pillow-heif, hors du projet) ;
sans lui, ceux déjà présents sont conservés tels quels.

Chaque image « vue » (telle qu'elle doit apparaître une fois redressée) porte trois repères
asymétriques : carré rouge en haut à gauche, bleu en haut à droite, vert en bas à gauche,
le coin bas droit restant vide. Les huit orientations EXIF donnent donc huit dispositions
distinctes. Le fichier stocké contient les pixels « capteur » : l'image vue transformée par
l'inverse de son orientation, comme le fait un appareil photo.
"""

import base64
import io
import json
from pathlib import Path

from PIL import Image, ImageDraw

HERE = Path(__file__).resolve().parent

RED = (230, 20, 30)
BLUE = (20, 60, 230)
GREEN = (20, 200, 60)


def marker_boxes(w, h):
    side = min(w, h)
    s = round(side * 0.15)
    m = round(side * 0.05)
    return {
        "rouge": (m, m, m + s, m + s),
        "bleu": (w - m - s, m, w - m, m + s),
        "vert": (m, h - m - s, m + s, h - m),
    }


def scene(w, h, mode="RGB"):
    """Image vue : dégradé gris-bleu vertical et trois repères."""
    top, bottom = (120, 130, 150), (60, 66, 80)
    grad = Image.linear_gradient("L").resize((w, h))
    channels = [grad.point(lambda v, a=a, b=b: round(a + (b - a) * v / 255)) for a, b in zip(top, bottom)]
    img = Image.merge("RGB", channels)
    draw = ImageDraw.Draw(img)
    boxes = marker_boxes(w, h)
    for name, color in (("rouge", RED), ("bleu", BLUE), ("vert", GREEN)):
        draw.rectangle(boxes[name], fill=color)
    if mode == "RGBA":
        img = img.convert("RGBA")
        # Coin bas droit transparent : l'import doit l'aplatir sur du blanc.
        img.paste(Image.new("RGBA", (w // 4, h // 4), (0, 0, 0, 0)), (w - w // 4, h - h // 4))
    return img


def markers_relative(w, h):
    out = {}
    for name, (x0, y0, x1, y1) in marker_boxes(w, h).items():
        out[name] = [round((x0 + x1) / 2 / w, 4), round((y0 + y1) / 2 / h, 4)]
    return out


# Transformation à appliquer à l'image vue pour obtenir les pixels stockés (inverse de l'orientation).
TO_STORED = {
    1: None,
    3: Image.Transpose.ROTATE_180,
    6: Image.Transpose.ROTATE_90,  # l'affichage tournera de 90° dans le sens horaire
    8: Image.Transpose.ROTATE_270,
}


def stored(view, orientation):
    t = TO_STORED[orientation]
    return view if t is None else view.transpose(t)


def exif_with_orientation(orientation):
    exif = Image.Exif()
    exif[0x0112] = orientation
    exif[0x010F] = "STORY tests"  # Make : métadonnée qui doit disparaître après import
    return exif.tobytes()


manifest = []


def add(name, source_type, view_size, expected, **extra):
    manifest.append(
        {
            "file": name,
            "sourceType": source_type,
            "viewWidth": view_size[0],
            "viewHeight": view_size[1],
            "expectedWidth": expected[0],
            "expectedHeight": expected[1],
            "markers": markers_relative(*view_size),
            **extra,
        }
    )


def jpeg(name, view_size, orientation, quality=92):
    img = stored(scene(*view_size), orientation)
    kwargs = {"quality": quality}
    if orientation != 1:
        kwargs["exif"] = exif_with_orientation(orientation)
    img.save(HERE / name, "JPEG", **kwargs)


# JPEG avec orientation EXIF : 1600 × 1200 stocké, 1200 × 1600 attendu.
for o in (6, 3, 8):
    stored_size = (1600, 1200) if o in (6, 8) else (1200, 1600)
    name = f"jpeg-exif{o}-{stored_size[0]}x{stored_size[1]}.jpg"
    jpeg(name, (1200, 1600), o)
    add(name, "image/jpeg", (1200, 1600), (1200, 1600), orientation=o, warnings=[])

# JPEG paysage sans EXIF.
jpeg("jpeg-paysage-1920x1440.jpg", (1920, 1440), 1)
add("jpeg-paysage-1920x1440.jpg", "image/jpeg", (1920, 1440), (1920, 1440), orientation=1, warnings=[])

# Gros JPEG 6000 × 8000 (48 Mpx) : plafonné à 1920 × 2560.
jpeg("grosse-6000x8000.jpg", (6000, 8000), 1, quality=85)
add("grosse-6000x8000.jpg", "image/jpeg", (6000, 8000), (1920, 2560), orientation=1, warnings=[])

# PNG avec transparence.
scene(1080, 1350, "RGBA").save(HERE / "png-alpha-1080x1350.png", "PNG", optimize=True)
add(
    "png-alpha-1080x1350.png",
    "image/png",
    (1080, 1350),
    (1080, 1350),
    orientation=1,
    warnings=[],
    transparentCorner=[0.95, 0.95],
)

# WebP trop petit pour 1080 × 1920 : avertissement attendu.
scene(900, 1200).save(HERE / "webp-900x1200.webp", "WEBP", quality=90)
add("webp-900x1200.webp", "image/webp", (900, 1200), (900, 1200), orientation=1, warnings=["basse_definition"])

# Faux fichier : du texte nommé .jpg.
(HERE / "faux.jpg").write_text("Ceci n'est pas une photo, seulement du texte renommé en .jpg.\n", encoding="utf-8")

# HEIC (si pillow-heif est disponible).
try:
    import pillow_heif

    pillow_heif.register_heif_opener()
    scene(1200, 1600).save(HERE / "heic-1200x1600.heic", "HEIF", quality=90)
    # Comme un iPhone : pixels capteur paysage + transformation « irot » (et EXIF Orientation=6).
    stored(scene(1200, 1600), 6).save(
        HERE / "heic-irot-1600x1200.heic", "HEIF", quality=90, exif=exif_with_orientation(6)
    )
    print("HEIC générés avec pillow-heif", pillow_heif.__version__)
except ImportError:
    print("pillow-heif absent : HEIC non régénérés")

if (HERE / "heic-1200x1600.heic").exists():
    add("heic-1200x1600.heic", "image/heic", (1200, 1600), (1200, 1600), orientation=1, warnings=[])
if (HERE / "heic-irot-1600x1200.heic").exists():
    add("heic-irot-1600x1200.heic", "image/heic", (1200, 1600), (1200, 1600), orientation=6, warnings=[])

(HERE / "manifest.json").write_text(json.dumps({"photos": manifest, "invalid": ["faux.jpg"]}, indent=2) + "\n")

# Sonde d'orientation embarquée dans src/lib/photos/orientation.ts :
# 16 × 8 stocké, moitié gauche rouge, moitié droite bleue, Orientation=6.
# Redressée : 8 × 16, rouge en haut, bleu en bas.
probe = Image.new("RGB", (16, 8), BLUE)
probe.paste(Image.new("RGB", (8, 8), RED), (0, 0))
buf = io.BytesIO()
probe_exif = Image.Exif()
probe_exif[0x0112] = 6
probe.save(buf, "JPEG", quality=95, exif=probe_exif.tobytes(), subsampling=0)
print("sonde", len(buf.getvalue()), "octets")
print(base64.b64encode(buf.getvalue()).decode())
