import { TrackerEvent, TrackerResourceType } from "./publicTracker";

export enum PublicSubmissionKind {
  Event = "event",
  Feedback = "feedback",
  Qa = "qa",
}

export interface PublicEventSubmission {
  kind: PublicSubmissionKind.Event;
  linkId: string;
  resourceId: string;
  resourceType?: TrackerResourceType;
  workspaceId?: string;
  documentId?: string | null;
  event: TrackerEvent;
  sessionId?: string | null;
  pageNumber?: number | null;
  sectionOffset?: number | null;
  durationMs?: number | null;
}

export interface PublicFeedbackSubmission {
  kind: PublicSubmissionKind.Feedback;
  linkId: string;
  resourceId: string;
  resourceType?: TrackerResourceType;
  workspaceId?: string;
  submission: unknown;
}

export interface PublicQASubmission {
  kind: PublicSubmissionKind.Qa;
  linkId: string;
  resourceId: string;
  resourceType?: TrackerResourceType;
  workspaceId?: string;
  question: string;
  answer?: string | null;
}

export type PublicSubmissionRequest =
  PublicEventSubmission | PublicFeedbackSubmission | PublicQASubmission;
