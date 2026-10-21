// Schémas de sortie demandés au modèle (sorties structurées), plus simples que le contrat StoryPlan :
// les sorties structurées n'acceptent ni longueur de chaîne ni bornes de tableau au-delà de minItems 0/1
// (référence SDK, « JSON Schema Limitations »). Le serveur valide ensuite tout avec StoryPlanSchema et
// les contrôles. Les 5 stories sont des propriétés nommées (story1…story5), toutes requises : le décodage
// contraint garantit ainsi exactement 5 stories, ce qu'un tableau ne permettrait pas.
//
// Le JSON Schema est écrit à la main : le helper zod du SDK (1.0.0) déplace `enum` dans la description et
// perd les descriptions des sous-schémas réutilisés. Les schémas zod ci-dessous relisent la réponse.
import "server-only";
import { z } from "zod";
import { STRUCTURE_IDS } from "@/domain/structures";
import { STORY_COUNT, type Paragraph, type PlanStory, type StoryPlan } from "@/domain/story-plan";

// Relecture de la réponse du modèle (même forme que les JSON Schema plus bas).
// proofIds est toujours demandé (liste vide si aucune preuve) mais toléré absent à la relecture.
const ModelParagraphSchema = z.object({
  text: z.string(),
  accents: z.array(z.string()),
  proofIds: z.array(z.string()).optional(),
});
export const ModelStorySchema = z.object({ role: z.string(), paragraphs: z.array(ModelParagraphSchema) });
export type ModelStory = z.infer<typeof ModelStorySchema>;

export const STORY_KEYS = ["story1", "story2", "story3", "story4", "story5"] as const;
if (STORY_KEYS.length !== STORY_COUNT) throw new Error("STORY_KEYS doit suivre STORY_COUNT.");

export const ModelPlanSchema = z.object({
  structureId: z.enum(STRUCTURE_IDS),
  angle: z.string(),
  stories: z.object({
    story1: ModelStorySchema,
    story2: ModelStorySchema,
    story3: ModelStorySchema,
    story4: ModelStorySchema,
    story5: ModelStorySchema,
  }),
});
export type ModelPlan = z.infer<typeof ModelPlanSchema>;

export const ModelIdeasSchema = z.object({
  ideas: z.array(z.object({ idea: z.string(), structureId: z.enum(STRUCTURE_IDS), hook: z.string() })),
});
export type ModelIdeas = z.infer<typeof ModelIdeasSchema>;

export interface JsonOutputFormat {
  type: "json_schema";
  schema: Record<string, unknown>;
}

const text = (description: string) => ({ type: "string", description });
const object = (properties: Record<string, unknown>, description?: string) => ({
  type: "object",
  ...(description ? { description } : {}),
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});

// proofIds figure dans `required` (le décodage contraint oblige le modèle à se poser la question à chaque
// paragraphe) mais reste facultatif dans les faits : une liste vide signifie « aucune preuve citée ».
const paragraphJson = object({
  text: text("Texte brut du paragraphe, sans balisage. 140 caractères au plus."),
  accents: {
    type: "array",
    description: "0 à 3 expressions de 1 à 5 mots, recopiées exactement depuis text.",
    items: { type: "string" },
  },
  proofIds: {
    type: "array",
    description:
      "Identifiants des preuves du contexte citées par ce paragraphe (« p1 », « p2 »…), obligatoires dès qu'il cite un chiffre, une durée, un montant, un client ou un résultat tirés d'une preuve. Liste vide sinon.",
    items: { type: "string" },
  },
});

const storyJson = (description: string) =>
  object(
    {
      role: text("Rôle de la story en 1 à 3 mots (« accroche », « liste », « appel à l'action »…)."),
      paragraphs: {
        type: "array",
        description: "Story 1 : 1 ou 2 paragraphes. Stories 2 à 5 : 2 ou 3.",
        minItems: 1,
        items: paragraphJson,
      },
    },
    description,
  );

const structureJson = (description: string) => ({ type: "string", enum: [...STRUCTURE_IDS], description });

/** Format de sortie d'une séquence (output_config.format). */
export const PLAN_OUTPUT_FORMAT: JsonOutputFormat = {
  type: "json_schema",
  schema: object({
    structureId: structureJson("Identifiant de la structure narrative suivie."),
    angle: text("L'idée centrale de la séquence, en une phrase (non affichée)."),
    stories: object({
      story1: storyJson("Photo 1 : l'accroche, seule."),
      story2: storyJson("Photo 2 : le développement."),
      story3: storyJson("Photo 2 : la suite, affichée sous la story 2 grisée. Ne répète pas la 2."),
      story4: storyJson("Photo 3 : la bascule."),
      story5: storyJson("Photo 3 : la suite, sous la 4 grisée, qui finit par l'appel à l'action."),
    }),
  }),
};

/** Format de sortie d'une seule story (« Refaire cette story »). */
export const STORY_OUTPUT_FORMAT: JsonOutputFormat = {
  type: "json_schema",
  schema: storyJson("La nouvelle version de la story demandée, et elle seule."),
};

/** Format de sortie des idées (output_config.format). */
export const IDEAS_OUTPUT_FORMAT: JsonOutputFormat = {
  type: "json_schema",
  schema: object({
    ideas: {
      type: "array",
      description: "Exactement 5 idées.",
      minItems: 1,
      items: object({
        idea: text("L'idée de séquence, 1 ou 2 phrases, prête à coller dans le champ « idée »."),
        structureId: structureJson("Structure la plus adaptée à cette idée."),
        hook: text("Une accroche possible pour la story 1, 20 mots au plus."),
      }),
    },
  }),
};

/** Story au format du modèle → PlanStory (proofIds omis quand la liste est vide). */
export function toPlanStory(story: ModelStory): PlanStory {
  return {
    role: story.role.trim(),
    paragraphs: story.paragraphs
      .map((p): Paragraph => {
        const proofIds = (p.proofIds ?? []).map((id) => id.trim()).filter(Boolean);
        return {
          text: p.text.trim(),
          accents: p.accents.map((a) => a.trim()).filter(Boolean),
          ...(proofIds.length ? { proofIds } : {}),
        };
      })
      .filter((p) => p.text.length > 0),
  };
}

/** Plan au format du modèle → StoryPlan (sans validation : elle vient après les contrôles). */
export function toStoryPlan(raw: ModelPlan): StoryPlan {
  return {
    schemaVersion: 1,
    structureId: raw.structureId,
    angle: raw.angle.trim(),
    stories: STORY_KEYS.map((key) => toPlanStory(raw.stories[key])),
  };
}

/** PlanStory → format du modèle (proofIds toujours présent, comme dans le schéma de sortie). */
export function toModelStory(story: PlanStory): ModelStory {
  return {
    role: story.role,
    paragraphs: story.paragraphs.map((p) => ({ text: p.text, accents: [...p.accents], proofIds: [...(p.proofIds ?? [])] })),
  };
}

/** StoryPlan → format du modèle (exemple de ton, plan à corriger, séquence actuelle). */
export function toModelPlan(plan: StoryPlan): ModelPlan {
  const entries = STORY_KEYS.map((key, i) => [key, toModelStory(plan.stories[i])] as const);
  return {
    structureId: plan.structureId as ModelPlan["structureId"],
    angle: plan.angle,
    stories: Object.fromEntries(entries) as ModelPlan["stories"],
  };
}
