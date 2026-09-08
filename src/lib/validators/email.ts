import { z } from "zod";

const emailSchema = z.string().trim().email();

export const isValidEmail = (value: string): boolean =>
  emailSchema.safeParse(value).success;
