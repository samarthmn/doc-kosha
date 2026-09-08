import { z } from "zod";

export const ResourceType = z.enum(["document", "folder", "data_room"]);
