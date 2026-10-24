import { z } from "zod";

export const sourceReferenceSchema = z.object({
  pageNumber: z.number().int().positive(),
  sectionId: z.string().optional(),
  quote: z.string().max(280).optional(),
});

export const conceptSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  difficulty: z.enum(["beginner", "intermediate", "advanced"]),
  estimatedMinutes: z.number().int().min(1).max(600),
  sourceReferences: z.array(sourceReferenceSchema).max(20),
});

export const dependencySchema = z.object({
  prerequisiteId: z.string().min(1),
  dependentId: z.string().min(1),
  evidenceType: z.enum(["source", "inferred"]),
  rationale: z.string().min(1),
});

/**
 * Validates a client-supplied `ParsedDocument` in request bodies. Checks only the fields the
 * server reads; anything else passes through untouched.
 */
export const documentInputSchema = z.looseObject({
  id: z.string().min(1),
  title: z.string().nullable(),
  source: z.looseObject({ fileName: z.string() }),
  pages: z.array(
    z.looseObject({
      pageNumber: z.number().int(),
      text: z.string(),
      markdown: z.string().optional(),
    }),
  ),
  sections: z.array(
    z.looseObject({
      heading: z.string().nullable(),
      text: z.string(),
      pageNumbers: z.array(z.number().int()).optional(),
    }),
  ),
});

export const quizQuestionSchema = z.object({
  id: z.string(),
  prompt: z.string(),
  choices: z.array(z.string()).min(2).max(5),
  correctAnswer: z.string(),
  explanation: z.string(),
});

export const quizSchema = z.object({
  conceptId: z.string(),
  questions: z.array(quizQuestionSchema).min(1).max(5),
});

export const modelAnalysisSchema = z.object({
  understanding: z.object({
    subject: z.string().min(1),
    topics: z.array(z.string()).max(30),
    terminology: z.array(z.string()).max(50),
    equations: z.array(z.string()).max(30),
    definitions: z.array(z.string()).max(40),
    learningObjectives: z.array(z.string()).max(20),
  }),
  concepts: z.array(conceptSchema).min(1).max(60),
  dependencies: z.array(dependencySchema).max(180),
});

export const MODEL_ANALYSIS_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["understanding", "concepts", "dependencies"],
  properties: {
    understanding: {
      type: "object",
      additionalProperties: false,
      required: [
        "subject",
        "topics",
        "terminology",
        "equations",
        "definitions",
        "learningObjectives",
      ],
      properties: {
        subject: { type: "string" },
        topics: { type: "array", items: { type: "string" } },
        terminology: { type: "array", items: { type: "string" } },
        equations: { type: "array", items: { type: "string" } },
        definitions: { type: "array", items: { type: "string" } },
        learningObjectives: { type: "array", items: { type: "string" } },
      },
    },
    concepts: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "id",
          "name",
          "description",
          "difficulty",
          "estimatedMinutes",
          "sourceReferences",
        ],
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          description: { type: "string" },
          difficulty: { type: "string", enum: ["beginner", "intermediate", "advanced"] },
          estimatedMinutes: { type: "integer" },
          sourceReferences: {
            type: "array",
            items: {
              type: "object",
              required: ["pageNumber"],
              properties: {
                pageNumber: { type: "integer" },
                sectionId: { type: "string" },
                quote: { type: "string" },
              },
            },
          },
        },
      },
    },
    dependencies: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["prerequisiteId", "dependentId", "evidenceType", "rationale"],
        properties: {
          prerequisiteId: { type: "string" },
          dependentId: { type: "string" },
          evidenceType: { type: "string", enum: ["source", "inferred"] },
          rationale: { type: "string" },
        },
      },
    },
  },
} as const;
