"use client";

import React, {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription as AlertDialogBody,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";
import { groups } from "@/modules/user-groups";
import type { AlcGroupPickerProps } from "@/modules/user-groups";
import { createSupabaseBrowserClient } from "@/lib/supabase/browserClient";
import { normalizeEmail } from "@/lib/email";
import type { LinkAlcRules } from "@/lib/linkAlcClient";
import {
  consumeAlcReviewRequest,
  createAlcDialogFlowState,
  createLatestAlcMetadataLoadCoordinator,
  getAlcReviewMetadataState,
  loadCompleteAlcContentMetadata,
  transitionAlcDialogFlow,
  type AlcDialogDismissReason,
  type AlcOverlapResolution,
  type AlcRoomOverlap,
  type AlcRoomOverlapTarget,
} from "@/modules/public-links";
import {
  CaretUp,
  CircleNotch,
  FileText,
  FolderSimple,
  Info,
  Pencil,
  Plus,
  Shield,
  Trash,
  X,
} from "@phosphor-icons/react";

type UserGroupOption = {
  id: string;
  name: string;
  emailCount: number;
};

type DataRoomFolderOption = {
  id: string;
  name: string;
  parentFolderId: string | null;
};

type DataRoomDocumentOption = {
  id: string;
  title: string;
  folderId: string | null;
};

const dataRoomFolderRowsSchema = z.array(
  z.object({
    id: z.string().min(1),
    name: z.string(),
    parent_folder_id: z.string().nullable(),
  }),
);

const dataRoomDocumentRowsSchema = z.array(
  z.object({
    id: z.string().min(1),
    title: z.string(),
    folder_id: z.string().nullable(),
  }),
);

type DataRoomContentMetadataState = {
  dataRoomId: string | null;
  isLoading: boolean;
  error: string | null;
  folders: DataRoomFolderOption[];
  documents: DataRoomDocumentOption[];
};

const emptyDataRoomContentMetadata = (
  dataRoomId: string | null,
): DataRoomContentMetadataState => ({
  dataRoomId,
  isLoading: true,
  error: null,
  folders: [],
  documents: [],
});

type LinkAlcRulesDialogProps = {
  dataRoomId: string;
  userGroups: UserGroupOption[];
  rules: LinkAlcRules;
  onRulesChange: (rules: LinkAlcRules) => void;
  alcActive: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  reviewRequest?: number;
};

const buildFolderPaths = (
  folders: DataRoomFolderOption[],
): Map<string, string> => {
  const folderById = new Map<string, DataRoomFolderOption>();
  for (const folder of folders) folderById.set(folder.id, folder);

  const result = new Map<string, string>();
  const visiting = new Set<string>();

  const compute = (folderId: string): string => {
    const existing = result.get(folderId);
    if (existing) return existing;
    const folder = folderById.get(folderId);
    if (!folder) {
      result.set(folderId, "Unknown folder");
      return "Unknown folder";
    }
    if (visiting.has(folderId)) {
      result.set(folderId, folder.name);
      return folder.name;
    }
    visiting.add(folderId);
    const parentId = folder.parentFolderId;
    const parentPath = parentId ? compute(parentId) : "";
    visiting.delete(folderId);
    const path = parentPath ? `${parentPath} / ${folder.name}` : folder.name;
    result.set(folderId, path);
    return path;
  };

  for (const folder of folders) compute(folder.id);
  return result;
};

const EmailChipsEditor: React.FC<{
  label: string;
  placeholder: string;
  value: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
}> = ({ label, placeholder, value, onChange, disabled }) => {
  const emailSchema = useMemo(() => z.string().email(), []);
  const inputId = useId();
  const errorId = `${inputId}-error`;
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  const addEmail = useCallback(() => {
    const normalized = normalizeEmail(draft);
    const parsed = emailSchema.safeParse(normalized);
    if (!parsed.success) {
      setError("Enter a valid email");
      return;
    }
    setError(null);
    setDraft("");
    onChange(Array.from(new Set([...value, normalized])));
  }, [draft, emailSchema, onChange, value]);

  const removeEmail = useCallback(
    (email: string) => {
      onChange(value.filter((e) => e !== email));
    },
    [onChange, value],
  );

  return (
    <div className="space-y-1.5">
      <Label
        htmlFor={inputId}
        className="text-xs font-medium tracking-wider text-muted-foreground uppercase"
      >
        {label}
      </Label>
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Input
            id={inputId}
            value={draft}
            onChange={(e) => {
              setError(null);
              setDraft(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addEmail();
              }
            }}
            placeholder={placeholder}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? errorId : undefined}
            disabled={disabled}
            spellCheck={false}
            className={cn("h-11", error ? "border-destructive" : "")}
          />
        </div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={addEmail}
          disabled={disabled || !draft}
          className="h-11 shrink-0"
        >
          <Plus className="mr-2 h-4 w-4" aria-hidden />
          Add
        </Button>
      </div>
      {error ? (
        <p id={errorId} role="alert" className="px-1 text-xs text-destructive">
          {error}
        </p>
      ) : null}

      {value.length > 0 ? (
        <div className="flex flex-wrap gap-2 pt-1">
          {value.map((email) => (
            <Badge
              key={email}
              variant="secondary"
              className="flex max-w-full items-center gap-1 py-1 pr-1 pl-2 text-xs font-normal"
            >
              <span className="min-w-0 [overflow-wrap:anywhere]">{email}</span>
              <button
                type="button"
                onClick={() => removeEmail(email)}
                disabled={disabled}
                className={cn(
                  "-my-2 -mr-2 ml-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                  disabled ? "pointer-events-none opacity-50" : "",
                )}
                aria-label={`Remove ${email}`}
              >
                <X className="h-3 w-3" aria-hidden />
              </button>
            </Badge>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground italic">
          No emails added yet.
        </p>
      )}
    </div>
  );
};

const AlcGroupPicker = React.lazy(() => groups.loadAlcGroupPicker());

const GroupPicker: React.FC<AlcGroupPickerProps> = (props) => {
  return (
    <React.Suspense fallback={null}>
      <AlcGroupPicker {...props} />
    </React.Suspense>
  );
};

const LinkAlcRulesDialog: React.FC<LinkAlcRulesDialogProps> = ({
  dataRoomId,
  userGroups,
  rules,
  onRulesChange,
  alcActive,
  open: propsOpen,
  onOpenChange: propsOnOpenChange,
  reviewRequest = 0,
}) => {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [internalOpen, setInternalOpen] = useState(false);
  const metadataLoadCoordinator = useMemo(
    () => createLatestAlcMetadataLoadCoordinator(),
    [],
  );

  const isControlled = typeof propsOpen !== "undefined";
  const open = isControlled ? propsOpen : internalOpen;
  const setOpen = useCallback(
    (nextOpen: boolean): void => {
      if (isControlled) {
        propsOnOpenChange?.(nextOpen);
        return;
      }
      setInternalOpen(nextOpen);
    },
    [isControlled, propsOnOpenChange],
  );
  const [flowState, setFlowState] = useState(() =>
    createAlcDialogFlowState(rules),
  );
  const draftRules = flowState.draftRules;
  const review = flowState.review;
  const reviewEntryId = review?.entryId;
  const setDraftRules = useCallback((nextRules: LinkAlcRules): void => {
    setFlowState((current) => ({ ...current, draftRules: nextRules }));
  }, []);
  const wasOpenRef = useRef(false);
  const handledReviewRequestRef = useRef(reviewRequest);
  const pendingDismissReasonRef = useRef<AlcDialogDismissReason>("backdrop");
  const reviewHeadingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (!open) {
      wasOpenRef.current = false;
      return;
    }

    const openedNow = !wasOpenRef.current;
    const reviewConsumption = consumeAlcReviewRequest(
      handledReviewRequestRef.current,
      reviewRequest,
    );
    handledReviewRequestRef.current = reviewConsumption.cursor;
    const requestedReview = reviewConsumption.shouldOpen;
    if (!openedNow && !requestedReview) return;

    wasOpenRef.current = true;
    setFlowState((current) => {
      const next = createAlcDialogFlowState(rules, {
        openInReview: requestedReview,
      });
      if (!next.review) return next;
      return {
        ...next,
        review: {
          ...next.review,
          entryId: (current.review?.entryId ?? 0) + 1,
        },
      };
    });
    setExpandedFolderRules(new Set());
    setExpandedDocRules(new Set());
    setShowAddFolderRule(false);
    setShowAddDocRule(false);
    setNewFolderId("");
    setNewFolderAllowedEmails([]);
    setNewFolderAllowedGroupIds([]);
    setNewDocumentId("");
    setNewDocumentAllowedEmails([]);
    setNewDocumentAllowedGroupIds([]);
  }, [open, reviewRequest, rules]);

  useEffect(() => {
    if (reviewEntryId === undefined) return;
    reviewHeadingRef.current?.focus();
  }, [reviewEntryId]);

  const dismissDialog = useCallback(
    (reason: AlcDialogDismissReason): void => {
      setFlowState(
        (current) =>
          transitionAlcDialogFlow(current, { type: "dismiss", reason }).state,
      );
      setOpen(false);
    },
    [setOpen],
  );

  const handleDialogOpenChange = useCallback(
    (nextOpen: boolean): void => {
      if (!nextOpen) {
        dismissDialog(pendingDismissReasonRef.current);
        pendingDismissReasonRef.current = "backdrop";
        return;
      }
      setOpen(true);
    },
    [dismissDialog, setOpen],
  );

  const handleEscapeKeyDown = useCallback((): void => {
    pendingDismissReasonRef.current = "escape";
  }, []);

  const [metadataState, setMetadataState] =
    useState<DataRoomContentMetadataState>(() =>
      emptyDataRoomContentMetadata(null),
    );

  // Expanded state for rules list
  const [expandedFolderRules, setExpandedFolderRules] = useState<Set<string>>(
    new Set(),
  );
  const [expandedDocRules, setExpandedDocRules] = useState<Set<string>>(
    new Set(),
  );

  // "Add Rule" form visibility
  const [showAddFolderRule, setShowAddFolderRule] = useState(false);
  const [showAddDocRule, setShowAddDocRule] = useState(false);

  const [newFolderId, setNewFolderId] = useState<string>("");
  const [newFolderAllowedEmails, setNewFolderAllowedEmails] = useState<
    string[]
  >([]);
  const [newFolderAllowedGroupIds, setNewFolderAllowedGroupIds] = useState<
    string[]
  >([]);

  const [newDocumentId, setNewDocumentId] = useState<string>("");
  const [newDocumentAllowedEmails, setNewDocumentAllowedEmails] = useState<
    string[]
  >([]);
  const [newDocumentAllowedGroupIds, setNewDocumentAllowedGroupIds] = useState<
    string[]
  >([]);

  const loadDataRoomContent = useCallback(async (): Promise<void> => {
    if (!open || !dataRoomId) {
      metadataLoadCoordinator.cancel();
      return;
    }

    await metadataLoadCoordinator.run({
      load: async (signal) => {
        const { folders: folderRowsValue, documents: documentRowsValue } =
          await loadCompleteAlcContentMetadata({
            signal,
            fetchFolderPage: async ({ from, to, signal }) => {
              const { data, error } = await supabase
                .from("folders")
                .select("id,name,parent_folder_id")
                .eq("data_room_id", dataRoomId)
                .order("id", { ascending: true })
                .range(from, to)
                .abortSignal(signal);
              return { rows: data, error };
            },
            fetchDocumentPage: async ({ from, to, signal }) => {
              const { data, error } = await supabase
                .from("documents")
                .select("id,title,folder_id")
                .eq("data_room_id", dataRoomId)
                .order("id", { ascending: true })
                .range(from, to)
                .abortSignal(signal);
              return { rows: data, error };
            },
          });
        const folderRows = dataRoomFolderRowsSchema.parse(folderRowsValue);
        const documentRows =
          dataRoomDocumentRowsSchema.parse(documentRowsValue);

        return {
          folders: folderRows.map((folder) => ({
            id: folder.id,
            name: folder.name,
            parentFolderId: folder.parent_folder_id,
          })),
          documents: documentRows.map((document) => ({
            id: document.id,
            title: document.title,
            folderId: document.folder_id,
          })),
        };
      },
      onStart: () => {
        setMetadataState(emptyDataRoomContentMetadata(dataRoomId));
      },
      onSuccess: ({ folders, documents }) => {
        setMetadataState({
          dataRoomId,
          isLoading: true,
          error: null,
          folders,
          documents,
        });
      },
      onError: (error) => {
        console.error("[alc-dialog] failed to load data room content", error);
        setMetadataState({
          dataRoomId,
          isLoading: true,
          error: "Unable to load folders and documents.",
          folders: [],
          documents: [],
        });
      },
      onSettled: () => {
        setMetadataState((current) =>
          current.dataRoomId === dataRoomId
            ? { ...current, isLoading: false }
            : current,
        );
      },
    });
  }, [dataRoomId, metadataLoadCoordinator, open, supabase]);

  // Clear same-room metadata before a reopened dialog paints, and abort the
  // paired request immediately on close, room change, or unmount. The passive
  // load effect below is StrictMode-safe because cleanup invalidates its whole
  // generation before a replay can start.
  useLayoutEffect(() => {
    metadataLoadCoordinator.cancel();
    if (open && dataRoomId) {
      setMetadataState(emptyDataRoomContentMetadata(dataRoomId));
    }
    return () => metadataLoadCoordinator.cancel();
  }, [dataRoomId, metadataLoadCoordinator, open]);

  useEffect(() => {
    if (!open || !dataRoomId) return;
    void loadDataRoomContent();
    return () => metadataLoadCoordinator.cancel();
  }, [dataRoomId, loadDataRoomContent, metadataLoadCoordinator, open]);

  const metadataIsCurrent = open && metadataState.dataRoomId === dataRoomId;
  const isLoadingContent = !metadataIsCurrent || metadataState.isLoading;
  const contentError = metadataIsCurrent ? metadataState.error : null;
  const folders = useMemo(
    () => (metadataIsCurrent ? metadataState.folders : []),
    [metadataIsCurrent, metadataState.folders],
  );
  const documents = useMemo(
    () => (metadataIsCurrent ? metadataState.documents : []),
    [metadataIsCurrent, metadataState.documents],
  );

  const folderPaths = useMemo(() => buildFolderPaths(folders), [folders]);
  const folderOptions = useMemo(() => {
    return folders
      .map((f) => ({
        id: f.id,
        label: folderPaths.get(f.id) ?? f.name,
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [folderPaths, folders]);

  const documentOptions = useMemo(() => {
    return documents
      .map((d) => {
        const prefix = d.folderId ? folderPaths.get(d.folderId) : null;
        const label = prefix ? `${prefix} / ${d.title}` : d.title;
        return { id: d.id, label };
      })
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [documents, folderPaths]);

  const folderLabelById = useMemo(
    () => new Map(folderOptions.map((option) => [option.id, option.label])),
    [folderOptions],
  );
  const documentLabelById = useMemo(
    () => new Map(documentOptions.map((option) => [option.id, option.label])),
    [documentOptions],
  );
  const reviewMetadata = useMemo(
    () =>
      getAlcReviewMetadataState(review?.overlaps ?? [], {
        isLoading: isLoadingContent,
        error: contentError,
        folderLabels: folderLabelById,
        documentLabels: documentLabelById,
      }),
    [
      contentError,
      documentLabelById,
      folderLabelById,
      isLoadingContent,
      review?.overlaps,
    ],
  );

  const visibleFolderRules = useMemo(
    () =>
      [...draftRules.folders].sort((left, right) =>
        (folderPaths.get(left.folderId) ?? "Unknown Folder").localeCompare(
          folderPaths.get(right.folderId) ?? "Unknown Folder",
        ),
      ),
    [draftRules.folders, folderPaths],
  );

  const visibleDocumentRules = useMemo(
    () =>
      [...draftRules.documents].sort((left, right) => {
        const leftLabel =
          documentOptions.find((option) => option.id === left.documentId)
            ?.label ?? "Unknown Document";
        const rightLabel =
          documentOptions.find((option) => option.id === right.documentId)
            ?.label ?? "Unknown Document";
        return leftLabel.localeCompare(rightLabel);
      }),
    [documentOptions, draftRules.documents],
  );

  const selectableFolderOptions = useMemo(() => {
    const usedIds = new Set(draftRules.folders.map((rule) => rule.folderId));
    return folderOptions.filter(
      (option) => option.id === newFolderId || !usedIds.has(option.id),
    );
  }, [draftRules.folders, folderOptions, newFolderId]);

  const selectableDocumentOptions = useMemo(() => {
    const usedIds = new Set(
      draftRules.documents.map((rule) => rule.documentId),
    );
    return documentOptions.filter(
      (option) => option.id === newDocumentId || !usedIds.has(option.id),
    );
  }, [documentOptions, draftRules.documents, newDocumentId]);

  const folderRuleCount = draftRules.folders.length;
  const docRuleCount = draftRules.documents.length;

  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<{
    kind: "folder" | "document";
    id: string;
    label: string;
  } | null>(null);

  const clearAll = useCallback(() => {
    setDraftRules({
      room: { allowedEmails: [], allowedGroupIds: [] },
      folders: [],
      documents: [],
    });
    setNewFolderId("");
    setNewFolderAllowedEmails([]);
    setNewFolderAllowedGroupIds([]);
    setNewDocumentId("");
    setNewDocumentAllowedEmails([]);
    setNewDocumentAllowedGroupIds([]);
    setShowAddFolderRule(false);
    setShowAddDocRule(false);
  }, [setDraftRules]);

  const updateRoom = useCallback(
    (patch: Partial<LinkAlcRules["room"]>) => {
      setDraftRules({
        ...draftRules,
        room: {
          ...draftRules.room,
          ...patch,
        },
      });
    },
    [draftRules, setDraftRules],
  );

  const updateFolderRule = useCallback(
    (folderId: string, patch: Partial<LinkAlcRules["folders"][number]>) => {
      setDraftRules({
        ...draftRules,
        folders: draftRules.folders.map((r) =>
          r.folderId === folderId ? { ...r, ...patch } : r,
        ),
      });
    },
    [draftRules, setDraftRules],
  );

  const removeFolderRule = useCallback((folderId: string, label: string) => {
    setRemoveTarget({ kind: "folder", id: folderId, label });
  }, []);

  const updateDocumentRule = useCallback(
    (documentId: string, patch: Partial<LinkAlcRules["documents"][number]>) => {
      setDraftRules({
        ...draftRules,
        documents: draftRules.documents.map((r) =>
          r.documentId === documentId ? { ...r, ...patch } : r,
        ),
      });
    },
    [draftRules, setDraftRules],
  );

  const removeDocumentRule = useCallback(
    (documentId: string, label: string) => {
      setRemoveTarget({ kind: "document", id: documentId, label });
    },
    [],
  );

  const confirmRemoveRule = useCallback(() => {
    if (!removeTarget) return;

    if (removeTarget.kind === "folder") {
      setDraftRules({
        ...draftRules,
        folders: draftRules.folders.filter(
          (r) => r.folderId !== removeTarget.id,
        ),
      });
    } else {
      setDraftRules({
        ...draftRules,
        documents: draftRules.documents.filter(
          (r) => r.documentId !== removeTarget.id,
        ),
      });
    }

    setRemoveTarget(null);
  }, [draftRules, removeTarget, setDraftRules]);

  const canAddFolderRule =
    Boolean(newFolderId) &&
    (newFolderAllowedEmails.length > 0 || newFolderAllowedGroupIds.length > 0);
  const canAddDocumentRule =
    Boolean(newDocumentId) &&
    (newDocumentAllowedEmails.length > 0 ||
      newDocumentAllowedGroupIds.length > 0);

  const addFolderRule = useCallback(() => {
    if (!canAddFolderRule) return;
    const hasDuplicate = draftRules.folders.some(
      (r) => r.folderId === newFolderId,
    );
    if (hasDuplicate) return;

    setDraftRules({
      ...draftRules,
      folders: [
        ...draftRules.folders,
        {
          folderId: newFolderId,
          allowedEmails: newFolderAllowedEmails,
          allowedGroupIds: newFolderAllowedGroupIds,
        },
      ],
    });
    setNewFolderId("");
    setNewFolderAllowedEmails([]);
    setNewFolderAllowedGroupIds([]);
    setShowAddFolderRule(false);
  }, [
    canAddFolderRule,
    newFolderAllowedEmails,
    newFolderAllowedGroupIds,
    newFolderId,
    draftRules,
    setDraftRules,
  ]);

  const addDocumentRule = useCallback(() => {
    if (!canAddDocumentRule) return;
    const hasDuplicate = draftRules.documents.some(
      (r) => r.documentId === newDocumentId,
    );
    if (hasDuplicate) return;

    setDraftRules({
      ...draftRules,
      documents: [
        ...draftRules.documents,
        {
          documentId: newDocumentId,
          allowedEmails: newDocumentAllowedEmails,
          allowedGroupIds: newDocumentAllowedGroupIds,
        },
      ],
    });
    setNewDocumentId("");
    setNewDocumentAllowedEmails([]);
    setNewDocumentAllowedGroupIds([]);
    setShowAddDocRule(false);
  }, [
    canAddDocumentRule,
    newDocumentAllowedEmails,
    newDocumentAllowedGroupIds,
    newDocumentId,
    draftRules,
    setDraftRules,
  ]);

  const toggleFolderExpanded = (id: string) => {
    const next = new Set(expandedFolderRules);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setExpandedFolderRules(next);
  };

  const toggleDocExpanded = (id: string) => {
    const next = new Set(expandedDocRules);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setExpandedDocRules(next);
  };

  const handleApplyRules = useCallback((): void => {
    if (review && reviewMetadata.status !== "ready") return;

    const transition = transitionAlcDialogFlow(flowState, { type: "apply" });
    setFlowState(transition.state);
    if (transition.effect?.type !== "commit") return;

    onRulesChange(transition.effect.rules);
    setOpen(false);
  }, [flowState, onRulesChange, review, reviewMetadata.status, setOpen]);

  const updateReviewResolution = useCallback(
    (overlapKey: string, resolution: AlcOverlapResolution): void => {
      if (!review) return;
      setFlowState(
        (current) =>
          transitionAlcDialogFlow(current, {
            type: "choose_resolution",
            overlapKey,
            resolution,
          }).state,
      );
    },
    [review],
  );

  const getTargetLabel = useCallback(
    (target: AlcRoomOverlapTarget): string => {
      if (target.scope === "folder") {
        return folderLabelById.get(target.targetId) ?? "";
      }
      return documentLabelById.get(target.targetId) ?? "";
    },
    [documentLabelById, folderLabelById],
  );

  const getIdentityLabel = useCallback(
    (overlap: AlcRoomOverlap): string => {
      if (overlap.kind === "email") return overlap.displayValue;
      return (
        userGroups.find((group) => group.id === overlap.displayValue)?.name ??
        overlap.displayValue
      );
    },
    [userGroups],
  );

  return (
    <Dialog open={open} onOpenChange={handleDialogOpenChange}>
      <DialogContent
        className="dk-nocturne-overlay flex h-[85dvh] max-h-[85dvh] w-[calc(100vw-2rem)] max-w-4xl flex-col gap-0 overflow-hidden rounded-[14px] p-0"
        onEscapeKeyDown={handleEscapeKeyDown}
        onPointerDownOutside={() => {
          pendingDismissReasonRef.current = "backdrop";
        }}
      >
        <div className="flex h-full min-h-0 flex-col">
          <DialogHeader className="relative shrink-0 space-y-1 border-b border-border/70 px-4 py-4 sm:px-6">
            <div
              className="absolute inset-x-0 top-0 h-px bg-primary/55"
              aria-hidden="true"
            />
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex min-w-0 flex-1 items-center gap-2.5">
                <div className="flex size-9 items-center justify-center rounded border border-primary/25 bg-primary/8 text-primary">
                  <Shield aria-hidden className="h-5 w-5" />
                </div>
                <div>
                  <DialogTitle className="text-lg font-medium tracking-tight">
                    Advanced Level Control
                  </DialogTitle>
                  <DialogDescription className="mt-0.5 text-sm text-muted-foreground">
                    Grant additive access across the room, folders, and
                    documents.
                  </DialogDescription>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge
                  variant="outline"
                  className="bg-muted/50 text-xs font-normal"
                >
                  {alcActive ? "Active" : "Inactive"}
                </Badge>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-11 w-11 rounded-full"
                  onClick={() => dismissDialog("close")}
                  aria-label="Close advanced level control"
                >
                  <X aria-hidden className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </DialogHeader>

          {review ? (
            <div className="flex-1 overflow-x-hidden overflow-y-auto px-4 py-4 sm:px-6 sm:py-6">
              <div className="mx-auto max-w-3xl space-y-5">
                <div aria-live="assertive" className="space-y-2">
                  <h3
                    ref={reviewHeadingRef}
                    tabIndex={-1}
                    className="text-base font-semibold outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  >
                    Review overlapping access
                  </h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    Each identity below has room-wide access and detailed
                    access. Choose one placement before applying these rules.
                  </p>
                </div>
                {reviewMetadata.status === "loading" ? (
                  <div
                    role="status"
                    className="flex items-center gap-3 rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground"
                  >
                    <CircleNotch
                      aria-hidden
                      className="h-5 w-5 shrink-0 animate-spin motion-reduce:animate-none"
                    />
                    Loading access locations…
                  </div>
                ) : null}
                {reviewMetadata.status === "error" ? (
                  <div
                    role="alert"
                    className="flex flex-col gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <p className="text-sm text-destructive">
                      Unable to verify access locations. Try loading them again.
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      className="h-11 shrink-0"
                      onClick={() => void loadDataRoomContent()}
                    >
                      Retry
                    </Button>
                  </div>
                ) : null}
                {reviewMetadata.status === "unresolved" ? (
                  <div
                    role="alert"
                    className="flex flex-col gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <p className="text-sm text-destructive">
                      Some access locations are unavailable. Reload the room
                      before applying these rules.
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      className="h-11 shrink-0"
                      onClick={() => void loadDataRoomContent()}
                    >
                      Retry
                    </Button>
                  </div>
                ) : null}
                <div className="space-y-3">
                  {review.overlaps.map((overlap) => (
                    <section
                      key={overlap.key}
                      className="overflow-hidden rounded-lg border bg-card"
                    >
                      <div className="border-b px-4 py-3">
                        <p className="text-sm font-semibold [overflow-wrap:anywhere]">
                          {getIdentityLabel(overlap)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Also grants {overlap.targets.length} selected{" "}
                          {overlap.targets.length === 1 ? "item" : "items"}
                        </p>
                      </div>
                      <div className="space-y-3 p-4">
                        {reviewMetadata.status === "ready" ? (
                          <ul className="space-y-1 text-sm text-muted-foreground">
                            {overlap.targets.map((target) => (
                              <li
                                key={`${target.scope}:${target.targetId}`}
                                className="[overflow-wrap:anywhere]"
                              >
                                <span className="font-medium text-foreground">
                                  {target.scope === "folder"
                                    ? "Folder"
                                    : "Document"}
                                  :
                                </span>{" "}
                                {getTargetLabel(target)}
                              </li>
                            ))}
                          </ul>
                        ) : null}
                        <RadioGroup
                          value={review.resolutions[overlap.key]}
                          onValueChange={(value) => {
                            if (
                              value === "keep_room" ||
                              value === "keep_detailed"
                            ) {
                              updateReviewResolution(overlap.key, value);
                            }
                          }}
                          aria-label={`Resolution for ${getIdentityLabel(overlap)}`}
                          className="grid gap-2 sm:grid-cols-2"
                        >
                          <Label
                            htmlFor={`alc-resolution-${overlap.key}-room`}
                            className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md border px-3 py-2 text-sm"
                          >
                            <RadioGroupItem
                              id={`alc-resolution-${overlap.key}-room`}
                              value="keep_room"
                            />
                            Keep room-wide
                          </Label>
                          <Label
                            htmlFor={`alc-resolution-${overlap.key}-detailed`}
                            className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md border px-3 py-2 text-sm"
                          >
                            <RadioGroupItem
                              id={`alc-resolution-${overlap.key}-detailed`}
                              value="keep_detailed"
                            />
                            Limit to selected items
                          </Label>
                        </RadioGroup>
                      </div>
                    </section>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <Tabs defaultValue="room" className="flex min-h-0 flex-1 flex-col">
              <div className="shrink-0 border-b border-border/60 bg-muted/10 px-4 py-3 sm:px-6">
                <TabsList className="grid min-h-11 w-full max-w-none grid-cols-3 border border-border/60 bg-card/45 p-1 sm:max-w-sm">
                  <TabsTrigger
                    value="room"
                    className="flex min-w-0 items-center gap-1 px-1 text-[11px] font-medium transition-all data-[state=active]:bg-background data-[state=active]:shadow-sm sm:gap-2 sm:px-3 sm:text-xs"
                  >
                    Room Wide
                  </TabsTrigger>
                  <TabsTrigger
                    value="folders"
                    className="flex min-w-0 items-center gap-1 px-1 text-[11px] font-medium transition-all data-[state=active]:bg-background data-[state=active]:shadow-sm sm:gap-2 sm:px-3 sm:text-xs"
                  >
                    Folders
                    {folderRuleCount > 0 && (
                      <span className="ml-1 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] leading-none text-primary">
                        {folderRuleCount}
                      </span>
                    )}
                  </TabsTrigger>
                  <TabsTrigger
                    value="documents"
                    className="flex min-w-0 items-center gap-1 px-1 text-[11px] font-medium transition-all data-[state=active]:bg-background data-[state=active]:shadow-sm sm:gap-2 sm:px-3 sm:text-xs"
                  >
                    Documents
                    {docRuleCount > 0 && (
                      <span className="ml-1 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] leading-none text-primary">
                        {docRuleCount}
                      </span>
                    )}
                  </TabsTrigger>
                </TabsList>
              </div>

              <div className="flex-1 overflow-x-hidden overflow-y-auto px-4 py-4 sm:px-6 sm:py-6">
                <TabsContent
                  value="room"
                  animateOnSwitch={false}
                  className="mt-0 space-y-6 outline-none"
                >
                  <div className="flex items-start gap-4 rounded-lg border border-primary/20 bg-primary/[0.045] p-4">
                    <div className="h-fit shrink-0 rounded border border-primary/20 bg-card p-2 text-primary">
                      <Shield aria-hidden className="h-4 w-4" />
                    </div>
                    <div className="space-y-1">
                      <h4 className="text-sm font-semibold text-foreground">
                        Global Access Rules
                      </h4>
                      <p className="text-sm leading-relaxed text-muted-foreground">
                        Users added here will have{" "}
                        <span className="font-medium text-foreground">
                          full access
                        </span>{" "}
                        to the entire data room, including all folders and
                        documents. Folder access includes every descendant;
                        document access covers one document. All rules are
                        additive grants, never restrictions or deny rules.
                      </p>
                    </div>
                  </div>

                  <div className="grid gap-6 md:grid-cols-2">
                    <div className="space-y-4">
                      <EmailChipsEditor
                        label="Allowed Emails"
                        placeholder="viewer@company.com"
                        value={draftRules.room.allowedEmails}
                        onChange={(next) => updateRoom({ allowedEmails: next })}
                      />
                    </div>
                    <div className="space-y-4">
                      <GroupPicker
                        label="Allowed Groups"
                        userGroups={userGroups}
                        value={draftRules.room.allowedGroupIds}
                        onChange={(next) =>
                          updateRoom({ allowedGroupIds: next })
                        }
                      />
                    </div>
                  </div>
                  {draftRules.room.allowedEmails.length > 0 ||
                  draftRules.room.allowedGroupIds.length > 0 ||
                  draftRules.folders.length > 0 ||
                  draftRules.documents.length > 0 ? (
                    <div className="flex justify-end border-t pt-4">
                      <Button
                        type="button"
                        variant="ghost"
                        className="h-11 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => setClearConfirmOpen(true)}
                      >
                        <Trash aria-hidden className="mr-2 h-4 w-4" />
                        Clear all rules
                      </Button>
                    </div>
                  ) : null}
                </TabsContent>

                <TabsContent
                  value="folders"
                  animateOnSwitch={false}
                  className="mt-0 space-y-6 outline-none"
                >
                  {contentError ? (
                    <div className="flex items-center gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-destructive shadow-sm">
                      <X aria-hidden className="h-5 w-5" />
                      <p className="text-sm font-medium">{contentError}</p>
                    </div>
                  ) : null}

                  {isLoadingContent ? (
                    <div className="flex flex-col items-center justify-center gap-4 py-20 text-muted-foreground">
                      <CircleNotch
                        aria-hidden
                        className="h-8 w-8 animate-spin text-primary/50"
                      />
                      <p className="text-sm font-medium">
                        Loading folder structure...
                      </p>
                    </div>
                  ) : (
                    <>
                      <div className="sticky top-0 z-10 -mx-4 flex flex-wrap items-center justify-between gap-2 border-b bg-background px-4 py-2 sm:-mx-6 sm:px-6">
                        <h3 className="flex items-center gap-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                          <FolderSimple aria-hidden className="h-3.5 w-3.5" />
                          Existing Rules ({folderRuleCount})
                        </h3>
                        <Button
                          onClick={() => setShowAddFolderRule(true)}
                          size="sm"
                          disabled={showAddFolderRule}
                          className="h-11 gap-1.5 shadow-sm"
                        >
                          <Plus aria-hidden className="h-3.5 w-3.5" />
                          Add Rule
                        </Button>
                      </div>

                      {showAddFolderRule && (
                        <div className="animate-in rounded-lg border border-border/70 bg-card [box-shadow:var(--dk-shadow-card)] duration-300 fade-in slide-in-from-top-2 motion-reduce:animate-none">
                          <div className="flex items-center justify-between rounded-t-lg border-b border-border/60 bg-muted/20 p-4">
                            <div className="flex items-center gap-2.5">
                              <div className="rounded-md bg-primary/10 p-1.5 text-primary shadow-sm">
                                <Plus aria-hidden className="h-4 w-4" />
                              </div>
                              <div>
                                <h3 className="text-sm font-semibold">
                                  Add Folder Rule
                                </h3>
                                <p className="text-xs text-muted-foreground">
                                  Grant access to a folder and all descendants
                                </p>
                              </div>
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setShowAddFolderRule(false)}
                              className="h-11 w-11 rounded-full hover:bg-muted/80"
                              aria-label="Cancel adding folder rule"
                            >
                              <X aria-hidden className="h-4 w-4" />
                            </Button>
                          </div>
                          <div className="space-y-5 p-5">
                            <div className="space-y-2">
                              <Label className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
                                Target Folder
                              </Label>
                              <Select
                                value={newFolderId}
                                onValueChange={setNewFolderId}
                              >
                                <SelectTrigger className="h-11 w-full bg-background shadow-sm transition-colors hover:bg-accent/20">
                                  <SelectValue placeholder="Select a folder..." />
                                </SelectTrigger>
                                <SelectContent className="max-h-[300px]">
                                  {selectableFolderOptions.length > 0 ? (
                                    selectableFolderOptions.map((opt) => (
                                      <SelectItem
                                        key={opt.id}
                                        value={opt.id}
                                        className="cursor-pointer"
                                      >
                                        <div className="flex items-center gap-2">
                                          <FolderSimple
                                            aria-hidden
                                            className="h-3.5 w-3.5 text-muted-foreground"
                                          />
                                          {opt.label}
                                        </div>
                                      </SelectItem>
                                    ))
                                  ) : (
                                    <SelectItem value="__none" disabled>
                                      No folders available
                                    </SelectItem>
                                  )}
                                </SelectContent>
                              </Select>
                            </div>

                            <div className="grid gap-5 md:grid-cols-2">
                              <EmailChipsEditor
                                label="Detailed Access: Emails"
                                placeholder="viewer@example.com"
                                value={newFolderAllowedEmails}
                                onChange={setNewFolderAllowedEmails}
                              />
                              <GroupPicker
                                label="Detailed Access: Groups"
                                userGroups={userGroups}
                                value={newFolderAllowedGroupIds}
                                onChange={setNewFolderAllowedGroupIds}
                              />
                            </div>

                            <div className="mt-2 flex flex-wrap justify-end gap-2 border-t pt-2">
                              <Button
                                variant="ghost"
                                onClick={() => setShowAddFolderRule(false)}
                                className="h-11"
                              >
                                Cancel
                              </Button>
                              <Button
                                onClick={addFolderRule}
                                disabled={!canAddFolderRule}
                                className="h-11 shadow-sm"
                              >
                                Create Rule
                              </Button>
                            </div>
                          </div>
                        </div>
                      )}

                      {draftRules.folders.length === 0 && !showAddFolderRule ? (
                        <EmptyState
                          icon={
                            <FolderSimple
                              aria-hidden
                              className="h-6 w-6 text-muted-foreground"
                            />
                          }
                          title="No folder rules yet"
                          description="Create rules to grant specific groups or individuals access to folders."
                        />
                      ) : (
                        <div className="space-y-3">
                          {visibleFolderRules.map((rule) => {
                            const isExpanded = expandedFolderRules.has(
                              rule.folderId,
                            );
                            const emailCount = rule.allowedEmails?.length || 0;
                            const groupCount =
                              rule.allowedGroupIds?.filter(Boolean).length || 0;
                            const folderRuleLabel =
                              folderPaths.get(rule.folderId) ??
                              "Unknown Folder";

                            return (
                              <div
                                key={rule.folderId}
                                className={cn(
                                  "overflow-hidden rounded-xl border transition-[border-color,box-shadow] duration-200 motion-reduce:transition-none",
                                  isExpanded
                                    ? "border-primary/20 bg-card shadow-md ring-2 ring-primary/10"
                                    : "bg-card hover:border-primary/30",
                                )}
                              >
                                {/* Summary Header */}
                                <div
                                  className={cn(
                                    "flex items-stretch transition-colors motion-reduce:transition-none",
                                    isExpanded
                                      ? "bg-muted/30"
                                      : "hover:bg-muted/10",
                                  )}
                                >
                                  <button
                                    type="button"
                                    className="flex min-h-11 min-w-0 flex-1 items-center justify-between gap-3 p-4 text-left focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring focus-visible:outline-solid"
                                    onClick={() =>
                                      toggleFolderExpanded(rule.folderId)
                                    }
                                    aria-expanded={isExpanded}
                                    aria-controls={`alc-folder-rule-${rule.folderId}`}
                                  >
                                    <span className="flex min-w-0 items-center gap-4">
                                      <span
                                        className={cn(
                                          "shrink-0 rounded-lg p-2.5 transition-colors motion-reduce:transition-none",
                                          isExpanded
                                            ? "bg-primary/10 text-primary"
                                            : "bg-muted text-muted-foreground",
                                        )}
                                      >
                                        <FolderSimple
                                          aria-hidden
                                          className="h-5 w-5"
                                        />
                                      </span>
                                      <span className="min-w-0 space-y-0.5">
                                        <span className="block text-sm font-semibold [overflow-wrap:anywhere] text-foreground">
                                          {folderRuleLabel}
                                        </span>
                                        <span className="flex items-center gap-2 text-xs text-muted-foreground">
                                          {emailCount === 0 &&
                                          groupCount === 0 ? (
                                            <span className="flex items-center gap-1 text-destructive">
                                              <Info
                                                aria-hidden
                                                className="h-3 w-3"
                                              />{" "}
                                              No access granted
                                            </span>
                                          ) : (
                                            <>
                                              {emailCount > 0 && (
                                                <span>
                                                  {emailCount} email
                                                  {emailCount !== 1 ? "s" : ""}
                                                </span>
                                              )}
                                              {emailCount > 0 &&
                                                groupCount > 0 && (
                                                  <span>•</span>
                                                )}
                                              {groupCount > 0 && (
                                                <span>
                                                  {groupCount} group
                                                  {groupCount !== 1 ? "s" : ""}
                                                </span>
                                              )}
                                            </>
                                          )}
                                        </span>
                                      </span>
                                    </span>
                                    <span className="shrink-0 text-muted-foreground">
                                      {isExpanded ? (
                                        <CaretUp
                                          aria-hidden
                                          className="h-4 w-4"
                                        />
                                      ) : (
                                        <Pencil
                                          aria-hidden
                                          className="h-3.5 w-3.5"
                                        />
                                      )}
                                    </span>
                                  </button>
                                  {isExpanded && (
                                    <div className="flex shrink-0 items-center pr-4">
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-11 w-11 p-0 text-destructive/80 hover:bg-destructive/10 hover:text-destructive"
                                        aria-label={`Remove folder access rule for ${folderRuleLabel}`}
                                        onClick={() => {
                                          removeFolderRule(
                                            rule.folderId,
                                            folderOptions.find(
                                              (f) => f.id === rule.folderId,
                                            )?.label ?? "Unknown folder",
                                          );
                                        }}
                                      >
                                        <Trash
                                          aria-hidden
                                          className="h-4 w-4"
                                        />
                                      </Button>
                                    </div>
                                  )}
                                </div>

                                {/* Expanded Content */}
                                {isExpanded && (
                                  <div
                                    id={`alc-folder-rule-${rule.folderId}`}
                                    className="animate-in border-t bg-background/50 p-5 duration-200 slide-in-from-top-1 motion-reduce:animate-none"
                                  >
                                    <div className="grid gap-6 md:grid-cols-2">
                                      <EmailChipsEditor
                                        label="Allowed Emails"
                                        placeholder="viewer@example.com"
                                        value={rule.allowedEmails}
                                        onChange={(next) =>
                                          updateFolderRule(rule.folderId, {
                                            allowedEmails: next,
                                          })
                                        }
                                      />
                                      <GroupPicker
                                        label="Allowed Groups"
                                        userGroups={userGroups}
                                        value={rule.allowedGroupIds}
                                        onChange={(next) =>
                                          updateFolderRule(rule.folderId, {
                                            allowedGroupIds: next,
                                          })
                                        }
                                      />
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </>
                  )}
                </TabsContent>

                <TabsContent
                  value="documents"
                  animateOnSwitch={false}
                  className="mt-0 space-y-6 outline-none"
                >
                  {contentError ? (
                    <div className="flex items-center gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-destructive shadow-sm">
                      <X aria-hidden className="h-5 w-5" />
                      <p className="text-sm font-medium">{contentError}</p>
                    </div>
                  ) : null}

                  {isLoadingContent ? (
                    <div className="flex flex-col items-center justify-center gap-4 py-20 text-muted-foreground">
                      <CircleNotch
                        aria-hidden
                        className="h-8 w-8 animate-spin text-primary/50"
                      />
                      <p className="text-sm font-medium">
                        Loading document structure...
                      </p>
                    </div>
                  ) : (
                    <>
                      <div className="sticky top-0 z-10 -mx-4 flex flex-wrap items-center justify-between gap-2 border-b bg-background px-4 py-2 sm:-mx-6 sm:px-6">
                        <h3 className="flex items-center gap-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                          <FileText aria-hidden className="h-3.5 w-3.5" />
                          Existing Rules ({docRuleCount})
                        </h3>
                        <Button
                          onClick={() => setShowAddDocRule(true)}
                          size="sm"
                          disabled={showAddDocRule}
                          className="h-11 gap-1.5 shadow-sm"
                        >
                          <Plus aria-hidden className="h-3.5 w-3.5" />
                          Add Rule
                        </Button>
                      </div>

                      {showAddDocRule && (
                        <div className="animate-in rounded-lg border border-border/70 bg-card [box-shadow:var(--dk-shadow-card)] duration-300 fade-in slide-in-from-top-2 motion-reduce:animate-none">
                          <div className="flex items-center justify-between rounded-t-lg border-b border-border/60 bg-muted/20 p-4">
                            <div className="flex items-center gap-2.5">
                              <div className="rounded-md bg-primary/10 p-1.5 text-primary shadow-sm">
                                <Plus aria-hidden className="h-4 w-4" />
                              </div>
                              <div>
                                <h3 className="text-sm font-semibold">
                                  Add Document Rule
                                </h3>
                                <p className="text-xs text-muted-foreground">
                                  Grant access to one document
                                </p>
                              </div>
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setShowAddDocRule(false)}
                              className="h-11 w-11 rounded-full hover:bg-muted/80"
                              aria-label="Cancel adding document rule"
                            >
                              <X aria-hidden className="h-4 w-4" />
                            </Button>
                          </div>
                          <div className="space-y-5 p-5">
                            <div className="space-y-2">
                              <Label className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
                                Target Document
                              </Label>
                              <Select
                                value={newDocumentId}
                                onValueChange={setNewDocumentId}
                              >
                                <SelectTrigger className="h-11 w-full bg-background shadow-sm transition-colors hover:bg-accent/20">
                                  <SelectValue placeholder="Select a document..." />
                                </SelectTrigger>
                                <SelectContent className="max-h-[300px]">
                                  {selectableDocumentOptions.length > 0 ? (
                                    selectableDocumentOptions.map((opt) => (
                                      <SelectItem
                                        key={opt.id}
                                        value={opt.id}
                                        className="cursor-pointer"
                                      >
                                        <div className="flex items-center gap-2">
                                          <FileText
                                            aria-hidden
                                            className="h-3.5 w-3.5 text-muted-foreground"
                                          />
                                          {opt.label}
                                        </div>
                                      </SelectItem>
                                    ))
                                  ) : (
                                    <SelectItem value="__none" disabled>
                                      No documents available
                                    </SelectItem>
                                  )}
                                </SelectContent>
                              </Select>
                            </div>

                            <div className="grid gap-5 md:grid-cols-2">
                              <EmailChipsEditor
                                label="Detailed Access: Emails"
                                placeholder="viewer@example.com"
                                value={newDocumentAllowedEmails}
                                onChange={setNewDocumentAllowedEmails}
                              />
                              <GroupPicker
                                label="Detailed Access: Groups"
                                userGroups={userGroups}
                                value={newDocumentAllowedGroupIds}
                                onChange={setNewDocumentAllowedGroupIds}
                              />
                            </div>

                            <div className="mt-2 flex flex-wrap justify-end gap-2 border-t pt-2">
                              <Button
                                variant="ghost"
                                onClick={() => setShowAddDocRule(false)}
                                className="h-11"
                              >
                                Cancel
                              </Button>
                              <Button
                                onClick={addDocumentRule}
                                disabled={!canAddDocumentRule}
                                className="h-11 shadow-sm"
                              >
                                Create Rule
                              </Button>
                            </div>
                          </div>
                        </div>
                      )}

                      {draftRules.documents.length === 0 && !showAddDocRule ? (
                        <EmptyState
                          icon={
                            <FileText
                              aria-hidden
                              className="h-6 w-6 text-muted-foreground"
                            />
                          }
                          title="No document rules yet"
                          description="Create rules to grant specific groups or individuals access to individual documents."
                        />
                      ) : (
                        <div className="space-y-3">
                          {visibleDocumentRules.map((rule) => {
                            const isExpanded = expandedDocRules.has(
                              rule.documentId,
                            );
                            const emailCount = rule.allowedEmails?.length || 0;
                            const groupCount =
                              rule.allowedGroupIds?.filter(Boolean).length || 0;
                            const documentRuleLabel =
                              documentOptions.find(
                                (document) => document.id === rule.documentId,
                              )?.label ?? "Unknown Document";

                            return (
                              <div
                                key={rule.documentId}
                                className={cn(
                                  "overflow-hidden rounded-xl border transition-[border-color,box-shadow] duration-200 motion-reduce:transition-none",
                                  isExpanded
                                    ? "border-primary/20 bg-card shadow-md ring-2 ring-primary/10"
                                    : "bg-card hover:border-primary/30",
                                )}
                              >
                                {/* Summary Header */}
                                <div
                                  className={cn(
                                    "flex items-stretch transition-colors motion-reduce:transition-none",
                                    isExpanded
                                      ? "bg-muted/30"
                                      : "hover:bg-muted/10",
                                  )}
                                >
                                  <button
                                    type="button"
                                    className="flex min-h-11 min-w-0 flex-1 items-center justify-between gap-3 p-4 text-left focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring focus-visible:outline-solid"
                                    onClick={() =>
                                      toggleDocExpanded(rule.documentId)
                                    }
                                    aria-expanded={isExpanded}
                                    aria-controls={`alc-document-rule-${rule.documentId}`}
                                  >
                                    <span className="flex min-w-0 items-center gap-4">
                                      <span
                                        className={cn(
                                          "shrink-0 rounded-lg p-2.5 transition-colors motion-reduce:transition-none",
                                          isExpanded
                                            ? "bg-primary/10 text-primary"
                                            : "bg-muted text-muted-foreground",
                                        )}
                                      >
                                        <FileText
                                          aria-hidden
                                          className="h-5 w-5"
                                        />
                                      </span>
                                      <span className="min-w-0 space-y-0.5">
                                        <span className="block text-sm font-semibold [overflow-wrap:anywhere] text-foreground">
                                          {documentRuleLabel}
                                        </span>
                                        <span className="flex items-center gap-2 text-xs text-muted-foreground">
                                          {emailCount === 0 &&
                                          groupCount === 0 ? (
                                            <span className="flex items-center gap-1 text-destructive">
                                              <Info
                                                aria-hidden
                                                className="h-3 w-3"
                                              />{" "}
                                              No access granted
                                            </span>
                                          ) : (
                                            <>
                                              {emailCount > 0 && (
                                                <span>
                                                  {emailCount} email
                                                  {emailCount !== 1 ? "s" : ""}
                                                </span>
                                              )}
                                              {emailCount > 0 &&
                                                groupCount > 0 && (
                                                  <span>•</span>
                                                )}
                                              {groupCount > 0 && (
                                                <span>
                                                  {groupCount} group
                                                  {groupCount !== 1 ? "s" : ""}
                                                </span>
                                              )}
                                            </>
                                          )}
                                        </span>
                                      </span>
                                    </span>
                                    <span className="shrink-0 text-muted-foreground">
                                      {isExpanded ? (
                                        <CaretUp
                                          aria-hidden
                                          className="h-4 w-4"
                                        />
                                      ) : (
                                        <Pencil
                                          aria-hidden
                                          className="h-3.5 w-3.5"
                                        />
                                      )}
                                    </span>
                                  </button>
                                  {isExpanded && (
                                    <div className="flex shrink-0 items-center pr-4">
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-11 w-11 p-0 text-destructive/80 hover:bg-destructive/10 hover:text-destructive"
                                        aria-label={`Remove document access rule for ${documentRuleLabel}`}
                                        onClick={() => {
                                          removeDocumentRule(
                                            rule.documentId,
                                            documentRuleLabel,
                                          );
                                        }}
                                      >
                                        <Trash
                                          aria-hidden
                                          className="h-4 w-4"
                                        />
                                      </Button>
                                    </div>
                                  )}
                                </div>

                                {/* Expanded Content */}
                                {isExpanded && (
                                  <div
                                    id={`alc-document-rule-${rule.documentId}`}
                                    className="animate-in border-t bg-background/50 p-5 duration-200 slide-in-from-top-1 motion-reduce:animate-none"
                                  >
                                    <div className="grid gap-6 md:grid-cols-2">
                                      <EmailChipsEditor
                                        label="Allowed Emails"
                                        placeholder="viewer@example.com"
                                        value={rule.allowedEmails}
                                        onChange={(next) =>
                                          updateDocumentRule(rule.documentId, {
                                            allowedEmails: next,
                                          })
                                        }
                                      />
                                      <GroupPicker
                                        label="Allowed Groups"
                                        userGroups={userGroups}
                                        value={rule.allowedGroupIds}
                                        onChange={(next) =>
                                          updateDocumentRule(rule.documentId, {
                                            allowedGroupIds: next,
                                          })
                                        }
                                      />
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </>
                  )}
                </TabsContent>
              </div>
            </Tabs>
          )}

          <DialogFooter className="mt-auto shrink-0 border-t border-border/60 bg-[var(--dk-surface-overlay)] px-4 py-3 sm:px-6">
            <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => dismissDialog("cancel")}
                className="h-11 w-full sm:w-auto sm:min-w-28"
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleApplyRules}
                disabled={Boolean(review) && reviewMetadata.status !== "ready"}
                className="h-11 w-full shadow-sm sm:w-auto sm:min-w-32"
              >
                Apply Rules
              </Button>
            </div>
          </DialogFooter>

          <AlertDialog
            open={clearConfirmOpen}
            onOpenChange={setClearConfirmOpen}
          >
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Clear all access rules?</AlertDialogTitle>
                <AlertDialogBody>
                  This removes room, folder, and document rules for this link.
                </AlertDialogBody>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel className="h-11">Cancel</AlertDialogCancel>
                <AlertDialogAction
                  variant="destructive"
                  className="h-11"
                  onClick={() => {
                    clearAll();
                    setClearConfirmOpen(false);
                  }}
                >
                  Clear rules
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <AlertDialog
            open={Boolean(removeTarget)}
            onOpenChange={(nextOpen) => {
              if (!nextOpen) setRemoveTarget(null);
            }}
          >
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Remove this rule?</AlertDialogTitle>
                <AlertDialogBody>
                  {(removeTarget?.label ?? "This rule") +
                    " will no longer grant access."}
                </AlertDialogBody>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel className="h-11">Cancel</AlertDialogCancel>
                <AlertDialogAction
                  variant="destructive"
                  className="h-11"
                  onClick={confirmRemoveRule}
                >
                  Remove rule
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default LinkAlcRulesDialog;
