"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  useEditor,
  EditorContent,
  useEditorState,
  type Editor,
} from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import { createSupabaseBrowserClient } from "@/lib/supabase/browserClient";
import { useGlobalStore } from "@/providers/globalStoreProvider";
import { useWorkspaceRole } from "@/hooks/useWorkspaceRole";
import { PageContainer } from "@/components/ui/page-container";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { showError, showSuccess, showWarning } from "@/lib/toast";
import { trackProductEvent } from "@/lib/analytics/productEvents";
import {
  Plus,
  PencilSimple as Edit,
  Trash as Trash2,
  Eye,
  TextB as Bold,
  TextItalic as Italic,
  TextUnderline as UnderlineIcon,
  ListBullets as List,
  ListNumbers as ListOrdered,
  SpinnerGap as Loader2,
  Signature as FileSignature,
  X,
  TextT as Type,
  ArrowRight,
} from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import {
  generateNdaTemplate,
  getDefaultNdaBodyHtml,
} from "@/modules/nda/template";
import type { Tables } from "@/types/generated/supabase";

type NdaTemplate = Tables<"nda_templates">;

// Module-scope so React keeps a stable component identity across renders of
// the page (an inline component would remount the toolbar on every render).
const EditorToolbar: React.FC<{ editor: Editor | null }> = ({ editor }) => {
  useEditorState({
    editor,
    selector: ({ transactionNumber }) => transactionNumber,
  });

  if (!editor) return null;

  const handlePointerCommand = (
    event: React.PointerEvent<HTMLButtonElement>,
    command: (instance: Editor) => boolean,
  ) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    command(editor);
  };

  const handleKeyCommand = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    command: (instance: Editor) => boolean,
  ) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    event.stopPropagation();
    command(editor);
  };

  const iconButtonClasses = (isActive: boolean) =>
    cn(
      "h-8 w-8 p-0 text-muted-foreground transition hover:bg-muted hover:text-foreground",
      "rounded-md border border-transparent",
      isActive && "bg-primary/10 text-primary border-primary/30",
    );

  const textButtonClasses = (isActive: boolean) =>
    cn(
      "h-8 px-2 text-xs font-semibold tracking-wide text-muted-foreground transition hover:bg-muted hover:text-foreground",
      "rounded-md border border-transparent",
      isActive && "bg-primary/10 text-primary border-primary/30",
    );

  const headingLevels = [2, 3, 4] as const;

  const getHeadingCommand =
    (level: (typeof headingLevels)[number]) => (instance: Editor) => {
      if (instance.isActive("heading", { level })) {
        return instance.chain().focus().setParagraph().run();
      }
      return instance.chain().focus().setHeading({ level }).run();
    };

  return (
    <div className="flex flex-wrap gap-2 border-b border-border bg-muted/30 p-2">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onPointerDown={(event) =>
          handlePointerCommand(event, (instance) =>
            instance.chain().focus().toggleBold().run(),
          )
        }
        onKeyDown={(event) =>
          handleKeyCommand(event, (instance) =>
            instance.chain().focus().toggleBold().run(),
          )
        }
        className={iconButtonClasses(editor.isActive("bold"))}
        aria-pressed={editor.isActive("bold")}
        aria-label="Bold"
      >
        <Bold className="h-4 w-4" aria-hidden />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onPointerDown={(event) =>
          handlePointerCommand(event, (instance) =>
            instance.chain().focus().toggleItalic().run(),
          )
        }
        onKeyDown={(event) =>
          handleKeyCommand(event, (instance) =>
            instance.chain().focus().toggleItalic().run(),
          )
        }
        className={iconButtonClasses(editor.isActive("italic"))}
        aria-pressed={editor.isActive("italic")}
        aria-label="Italic"
      >
        <Italic className="h-4 w-4" aria-hidden />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onPointerDown={(event) =>
          handlePointerCommand(event, (instance) =>
            instance.chain().focus().toggleUnderline().run(),
          )
        }
        onKeyDown={(event) =>
          handleKeyCommand(event, (instance) =>
            instance.chain().focus().toggleUnderline().run(),
          )
        }
        className={iconButtonClasses(editor.isActive("underline"))}
        aria-pressed={editor.isActive("underline")}
        aria-label="Underline"
      >
        <UnderlineIcon className="h-4 w-4" aria-hidden />
      </Button>
      <div className="mx-1 w-px bg-border" aria-hidden />
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onPointerDown={(event) =>
          handlePointerCommand(event, (instance) =>
            instance.chain().focus().setParagraph().run(),
          )
        }
        onKeyDown={(event) =>
          handleKeyCommand(event, (instance) =>
            instance.chain().focus().setParagraph().run(),
          )
        }
        className={textButtonClasses(editor.isActive("paragraph"))}
        aria-pressed={editor.isActive("paragraph")}
        aria-label="Paragraph"
      >
        <Type className="mr-1 h-3.5 w-3.5" aria-hidden />
        Text
      </Button>
      {headingLevels.map((level) => (
        <Button
          key={level}
          type="button"
          variant="ghost"
          size="sm"
          onPointerDown={(event) =>
            handlePointerCommand(event, getHeadingCommand(level))
          }
          onKeyDown={(event) =>
            handleKeyCommand(event, getHeadingCommand(level))
          }
          className={textButtonClasses(editor.isActive("heading", { level }))}
          aria-pressed={editor.isActive("heading", { level })}
          aria-label={`Heading level ${level}`}
        >
          H{level}
        </Button>
      ))}
      <div className="mx-1 w-px bg-border" aria-hidden />
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onPointerDown={(event) =>
          handlePointerCommand(event, (instance) =>
            instance.chain().focus().toggleBulletList().run(),
          )
        }
        onKeyDown={(event) =>
          handleKeyCommand(event, (instance) =>
            instance.chain().focus().toggleBulletList().run(),
          )
        }
        className={iconButtonClasses(editor.isActive("bulletList"))}
        aria-pressed={editor.isActive("bulletList")}
        aria-label="Bullet list"
      >
        <List className="h-4 w-4" aria-hidden />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onPointerDown={(event) =>
          handlePointerCommand(event, (instance) =>
            instance.chain().focus().toggleOrderedList().run(),
          )
        }
        onKeyDown={(event) =>
          handleKeyCommand(event, (instance) =>
            instance.chain().focus().toggleOrderedList().run(),
          )
        }
        className={iconButtonClasses(editor.isActive("orderedList"))}
        aria-pressed={editor.isActive("orderedList")}
        aria-label="Numbered list"
      >
        <ListOrdered className="h-4 w-4" aria-hidden />
      </Button>
    </div>
  );
};

const NdaTemplatesPage: React.FC = () => {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const currentWorkspaceId = useGlobalStore((s) => s.currentWorkspaceId);
  const { role: workspaceRole } = useWorkspaceRole(currentWorkspaceId);
  const isOwner = workspaceRole === "owner";

  const [templates, setTemplates] = useState<NdaTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Editor state
  const [showEditor, setShowEditor] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<NdaTemplate | null>(
    null,
  );
  const [templateName, setTemplateName] = useState("");
  const [pendingEditorContent, setPendingEditorContent] = useState<
    string | null
  >(null);
  const editorScrollRef = useRef<HTMLDivElement | null>(null);

  // Preview state
  const [showPreview, setShowPreview] = useState(false);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);

  // Delete state
  const [deleteTarget, setDeleteTarget] = useState<NdaTemplate | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // TipTap editor
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [2, 3, 4],
        },
      }),
      Underline,
    ],
    content: "",
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class:
          "dk-richtext text-sm max-w-none min-h-[300px] p-4 focus:outline-none",
      },
    },
  });

  useEffect(() => {
    if (!editor || pendingEditorContent === null) return;
    editor.commands.setContent(pendingEditorContent);
    setPendingEditorContent(null);
  }, [editor, pendingEditorContent]);

  const loadEditorContent = useCallback(
    (html: string) => {
      if (editor) {
        editor.commands.setContent(html);
      } else {
        setPendingEditorContent(html);
      }
    },
    [editor],
  );

  const loadTemplates = useCallback(async () => {
    if (!currentWorkspaceId) return;
    setIsLoading(true);
    setLoadError(null);
    try {
      const { data, error } = await supabase
        .from("nda_templates")
        .select("*")
        .eq("workspace_id", currentWorkspaceId)
        .is("archived_at", null)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setTemplates(data || []);
    } catch (err) {
      console.error("[NDA Templates] Failed to load templates", err);
      setLoadError(
        "Something went wrong while loading your NDA templates. Check your connection and try again.",
      );
      showError("Failed to load NDA templates");
    } finally {
      setIsLoading(false);
    }
  }, [supabase, currentWorkspaceId]);

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  const handleOpenCreate = () => {
    if (!isOwner) {
      showWarning("Only workspace owners can create NDA templates");
      return;
    }
    setEditingTemplate(null);
    setTemplateName("");
    loadEditorContent(getDefaultNdaBodyHtml());
    setShowEditor(true);
  };

  const handleOpenEdit = (template: NdaTemplate) => {
    if (!isOwner) {
      showWarning("Only workspace owners can edit NDA templates");
      return;
    }
    setEditingTemplate(template);
    setTemplateName(template.name);
    loadEditorContent(template.body_html);
    setShowEditor(true);
  };

  const handleSave = async () => {
    if (!currentWorkspaceId || !editor) return;

    const trimmedName = templateName.trim();
    if (!trimmedName) {
      showError("Template name is required");
      return;
    }

    const bodyHtml = editor.getHTML();
    if (!bodyHtml || bodyHtml === "<p></p>") {
      showError("Template body cannot be empty");
      return;
    }

    setIsSaving(true);
    try {
      const { data: userRes } = await supabase.auth.getUser();
      if (!userRes?.user) {
        showError("Session expired");
        return;
      }

      if (editingTemplate) {
        // Update existing template
        const { data, error } = await supabase
          .from("nda_templates")
          .update({
            name: trimmedName,
            body_html: bodyHtml,
            updated_at: new Date().toISOString(),
          })
          .eq("id", editingTemplate.id)
          .select()
          .single();

        if (error) throw error;
        setTemplates((prev) => prev.map((t) => (t.id === data.id ? data : t)));
        showSuccess("Template updated");
        trackProductEvent("nda_template_updated", {
          workspace_id: currentWorkspaceId,
          nda_template_id: data.id,
        });
      } else {
        // Create new template
        const { data, error } = await supabase
          .from("nda_templates")
          .insert({
            workspace_id: currentWorkspaceId,
            name: trimmedName,
            body_html: bodyHtml,
            created_by: userRes.user.id,
          })
          .select()
          .single();

        if (error) throw error;
        setTemplates((prev) => [data, ...prev]);
        showSuccess("Template created");
        trackProductEvent("nda_template_created", {
          workspace_id: currentWorkspaceId,
          nda_template_id: data.id,
        });
      }

      setShowEditor(false);
    } catch (err) {
      console.error("[NDA Templates] Save failed", err);
      showError("Failed to save template");
    } finally {
      setIsSaving(false);
    }
  };

  const handlePreview = (template?: NdaTemplate) => {
    const bodyHtml = template ? template.body_html : editor?.getHTML();
    if (!bodyHtml) return;

    const { previewHtml: html } = generateNdaTemplate({
      workspaceName: "Your Company",
      documentTitle: "Sample Document",
      receivingPartyName: "John Doe",
      receivingPartyEmail: "john@example.com",
      effectiveDate: new Date(),
      showSignaturePlaceholder: true,
      bodyHtmlOverride: bodyHtml,
    });

    setPreviewHtml(html);
    setShowPreview(true);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      // Soft delete by setting archived_at
      const { error } = await supabase
        .from("nda_templates")
        .update({ archived_at: new Date().toISOString() })
        .eq("id", deleteTarget.id);

      if (error) throw error;
      setTemplates((prev) => prev.filter((t) => t.id !== deleteTarget.id));
      showSuccess("Template deleted");
      trackProductEvent("nda_template_deleted", {
        workspace_id: currentWorkspaceId,
        nda_template_id: deleteTarget.id,
      });
    } catch (err) {
      console.error("[NDA Templates] Delete failed", err);
      showError("Failed to delete template");
    } finally {
      setIsDeleting(false);
      setDeleteTarget(null);
    }
  };

  if (!currentWorkspaceId) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-muted-foreground">No workspace selected</p>
      </div>
    );
  }

  return (
    <PageContainer className="mx-auto max-w-6xl space-y-6 pb-16">
      <PageHeader
        title="NDA Templates"
        description="Create and manage custom NDA templates for your workspace to automate legal compliance."
        actions={
          isOwner && (
            <Button onClick={handleOpenCreate} size="sm">
              <Plus className="mr-2 h-4 w-4" aria-hidden />
              New Template
            </Button>
          )
        }
        className="mb-6"
      />

      <div className="grid gap-6">
        {isLoading ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Skeleton className="h-8 w-64" />
              <Skeleton className="h-8 w-24" />
            </div>
            <div className="dk-nocturne-surface rounded-lg bg-card/45">
              <div className="border-b p-4">
                <Skeleton className="h-6 w-full" />
              </div>
              <div className="p-4">
                <Skeleton className="h-24 w-full" />
              </div>
            </div>
          </div>
        ) : loadError ? (
          <Card className="border-destructive/40 bg-destructive/5 [box-shadow:none]">
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <p className="text-sm font-medium">Unable to load templates</p>
              <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
                {loadError}
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={() => void loadTemplates()}
              >
                Retry
              </Button>
            </CardContent>
          </Card>
        ) : templates.length === 0 ? (
          <EmptyState
            icon={
              <FileSignature
                className="h-6 w-6 text-muted-foreground"
                aria-hidden
              />
            }
            title="No templates created yet"
            description={
              isOwner
                ? "Create your first NDA template to start securing your document shares."
                : "No NDA templates are available in this workspace."
            }
            actions={
              isOwner ? (
                <Button onClick={handleOpenCreate}>
                  Create template
                  <ArrowRight className="ml-2 h-4 w-4" aria-hidden />
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="dk-nocturne-surface overflow-hidden rounded-lg bg-card/45">
            <div className="relative w-full overflow-auto">
              <table className="w-full caption-bottom text-sm">
                <thead className="[&_tr]:border-b">
                  <tr className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted">
                    <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0">
                      Name
                    </th>
                    <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0">
                      Last Updated
                    </th>
                    <th className="h-12 px-4 text-right align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="[&_tr:last-child]:border-0">
                  {templates.map((template) => (
                    <tr
                      key={template.id}
                      className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted"
                    >
                      <td className="p-4 align-middle font-medium [&:has([role=checkbox])]:pr-0">
                        <div className="flex items-center gap-2">
                          <FileSignature
                            className="h-4 w-4 text-muted-foreground"
                            aria-hidden
                          />
                          <span>{template.name}</span>
                        </div>
                      </td>
                      <td className="p-4 align-middle [&:has([role=checkbox])]:pr-0">
                        <span className="text-muted-foreground">
                          {new Date(template.updated_at).toLocaleDateString()}
                        </span>
                      </td>
                      <td className="p-4 text-right align-middle [&:has([role=checkbox])]:pr-0">
                        <div className="flex items-center justify-end gap-2">
                          {isOwner && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0"
                              aria-label={`Edit ${template.name}`}
                              onClick={() => handleOpenEdit(template)}
                            >
                              <Edit className="h-3.5 w-3.5" aria-hidden />
                              <span className="sr-only">Edit</span>
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0"
                            aria-label={`Preview ${template.name}`}
                            onClick={() => handlePreview(template)}
                          >
                            <Eye className="h-3.5 w-3.5" aria-hidden />
                            <span className="sr-only">Preview</span>
                          </Button>
                          {isOwner && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0"
                              aria-label={`Delete ${template.name}`}
                              onClick={() => setDeleteTarget(template)}
                            >
                              <Trash2
                                className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive"
                                aria-hidden
                              />
                              <span className="sr-only">Delete</span>
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Editor Dialog */}
      <Dialog open={showEditor} onOpenChange={setShowEditor}>
        <DialogContent
          className="ph-no-capture flex max-h-[90vh] max-w-4xl flex-col gap-0 overflow-hidden p-0 sm:max-h-[85vh]"
          data-ph-no-capture
        >
          <DialogHeader className="shrink-0 border-b border-border/60 bg-background px-6 py-4">
            <p className="dk-nocturne-kicker">Agreement editor</p>
            <DialogTitle className="font-medium">
              {editingTemplate ? "Edit Template" : "Create Template"}
            </DialogTitle>
            <DialogDescription className="space-y-2">
              <span className="block">
                Customize the NDA clauses. The header (parties, dates) and
                signature block are added automatically.
              </span>
              <span className="block">
                The template editor controls only the body clauses between the
                metadata (workspace, parties, dates) and the signature block.
                Those sections are added automatically to keep NDA branding and
                auditing consistent.
              </span>
            </DialogDescription>
          </DialogHeader>

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="shrink-0 space-y-4 px-6 py-4">
              <div className="space-y-2">
                <Label htmlFor="template-name">Template Name</Label>
                <Input
                  id="template-name"
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  placeholder="e.g., Standard NDA, Investment NDA"
                  className="font-medium"
                  maxLength={120}
                />
              </div>
            </div>

            <div className="mx-4 mb-4 flex min-h-0 flex-1 flex-col overflow-hidden rounded border border-border/70 sm:mx-6">
              <EditorToolbar editor={editor} />
              <div
                className="h-full flex-1 overflow-y-auto bg-card"
                ref={editorScrollRef}
              >
                {editor ? (
                  <EditorContent
                    editor={editor}
                    className="dk-richtext min-h-[320px] max-w-none p-6 text-sm outline-none"
                  />
                ) : (
                  <Skeleton className="h-[320px] w-full" />
                )}
              </div>
            </div>
          </div>

          <DialogFooter className="grid shrink-0 grid-cols-2 gap-2 border-t border-border/60 bg-muted/[0.12] px-4 py-4 sm:flex sm:justify-end sm:px-6">
            <Button
              variant="outline"
              onClick={() => handlePreview()}
              disabled={isSaving}
              className="min-h-11 w-full min-w-0 sm:w-auto"
            >
              <Eye className="mr-2 h-4 w-4" aria-hidden />
              Preview
            </Button>
            <Button
              variant="outline"
              onClick={() => setShowEditor(false)}
              disabled={isSaving}
              className="min-h-11 w-full min-w-0 sm:w-auto"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={isSaving}
              className="col-span-2 min-h-11 w-full sm:w-auto"
            >
              {isSaving && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
              )}
              {editingTemplate ? "Save Changes" : "Create Template"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview Dialog */}
      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent
          className="ph-no-capture max-h-[90vh] max-w-3xl overflow-hidden p-0"
          data-ph-no-capture
        >
          <DialogHeader className="shrink-0 border-b border-border/60 bg-background px-6 py-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="dk-nocturne-kicker">Recipient view</p>
                <DialogTitle className="mt-1 font-medium">
                  NDA Preview
                </DialogTitle>
                <DialogDescription>
                  This is how the NDA will appear to viewers with sample data.
                </DialogDescription>
              </div>
              <DialogClose asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Close preview"
                  className="mt-1"
                >
                  <X className="h-4 w-4" aria-hidden />
                </Button>
              </DialogClose>
            </div>
          </DialogHeader>
          <div className="h-full max-h-[600px] overflow-y-auto bg-muted/[0.18]">
            {previewHtml && (
              <div
                className="nda-preview-html m-4 min-h-[500px] rounded border border-border/70 bg-background p-5 [box-shadow:var(--dk-shadow-card)] sm:p-8"
                dangerouslySetInnerHTML={{ __html: previewHtml }}
              />
            )}
          </div>
          <DialogFooter className="shrink-0 border-t border-border/60 bg-muted/[0.12] px-6 py-4">
            <Button variant="outline" onClick={() => setShowPreview(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete template?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget && (
                <>
                  This will delete <strong>{deleteTarget.name}</strong>.
                  Existing links using this template will continue to work with
                  their pinned snapshot.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={(e) => {
                e.preventDefault();
                void handleDelete();
              }}
              disabled={isDeleting}
            >
              {isDeleting && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
              )}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageContainer>
  );
};

export default NdaTemplatesPage;
