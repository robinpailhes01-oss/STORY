// Partie fixe du prompt système : rôle, méthode, structures, exemple. Elle ne dépend d'aucune donnée de
// la requête, pour que le cache de prompt la relise à l'identique d'un appel à l'autre (aucune date,
// aucun identifiant, ordre stable). Les données de l'utilisateur vont dans le message utilisateur.
import "server-only";
import { EXAMPLE_PLAN } from "@/domain/example-plan";
import { STRUCTURES } from "@/domain/structures";
import { SEQUENCE_LAYOUT } from "@/domain/story-plan";
import { toModelPlan } from "../schemas";
import { METHODE_V1 } from "./methode.v1";

const ROLE = `Tu es le copywriter d'un indépendant ou d'une petite entreprise. Tu écris en français des séquences de stories Instagram qui donnent envie de répondre en message privé, dans la voix de l'auteur décrit par le contexte. Tu réponds uniquement au format JSON demandé.`;

function describeStructures(): string {
  const lines = STRUCTURES.map((s) => {
    const temps = s.temps.map((t, i) => `   - Story ${i + 1}, ${SEQUENCE_LAYOUT[i].role} : ${t}`).join("\n");
    const preuves = s.requiresProofs
      ? "\n   Seulement si le contexte fournit des preuves réelles : sans preuve, ne la choisis jamais toi-même."
      : "";
    return `- ${s.id} : ${s.nom}. ${s.but}${preuves}\n${temps}`;
  });
  return `# Les structures narratives\nChaque structure donne le rôle de chacune des 5 stories. Le champ structureId contient l'identifiant (avant les deux-points).\n\n${lines.join("\n\n")}`;
}

function describeExample(): string {
  return `# Exemple de séquence réussie (structure idee-recue)
Cet exemple montre le ton, la longueur, la découpe en paragraphes, le choix des accents et le format JSON attendus. Il a été écrit pour un autre contexte : n'en reprends ni les phrases, ni les exemples, ni la ligne d'identité.

${JSON.stringify(toModelPlan(EXAMPLE_PLAN), null, 2)}`;
}

/** Bloc système commun à toutes les tâches (mis en cache). */
export const SYSTEM_FIXE = [ROLE, METHODE_V1, describeStructures(), describeExample()].join("\n\n");

/** Consignes propres à l'écriture d'une séquence (mises en cache avec le bloc commun). */
export const SYSTEM_SEQUENCE = `# Ta tâche : écrire une séquence
Tu reçois un contexte de marque, une idée (ou un texte de l'auteur) et la structure à suivre. Tu renvoies une séquence complète de 5 stories qui respecte la méthode, la structure et les limites de place. Relis-toi avant de répondre : longueurs, accents recopiés exactement, aucun chiffre ni résultat inventé, aucun mot interdit.`;

/** Consignes propres à la proposition d'idées (mises en cache avec le bloc commun). */
export const SYSTEM_IDEES = `# Ta tâche : proposer des idées de séquences
Tu reçois un contexte de marque. Tu proposes 5 idées de séquences que cet auteur pourrait publier cette semaine. Chaque idée est précise (un problème, un moment, une objection ou un conseil identifiable), ancrée dans l'activité, l'offre et la cible du contexte, et écrite comme l'auteur la noterait pour lui-même. Les 5 idées sont variées : au moins 4 structures différentes, des angles différents. Aucune idée ne doit supposer un chiffre, un résultat ou un témoignage absent des preuves.`;
