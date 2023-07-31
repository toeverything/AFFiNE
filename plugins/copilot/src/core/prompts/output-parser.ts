import { StructuredOutputParser } from 'langchain/output_parsers';
import { z } from 'zod';

export const followupQuestionParser = StructuredOutputParser.fromZodSchema(
  z.object({
    followupQuestions: z.array(z.string()),
  })
);
