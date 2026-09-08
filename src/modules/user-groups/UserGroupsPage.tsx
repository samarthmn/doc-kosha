"use client";

import React, { useCallback, useMemo, useState } from "react";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CardContent } from "@/components/ui/card";
import { SurfaceCard } from "@/components/ui/surface-card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageContainer } from "@/components/ui/page-container";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useRecentlyAddedRows } from "@/hooks/useRecentlyAddedRows";
import { useWorkspaceMembership } from "@/hooks/useWorkspaceMembership";
import { useWorkspaceRole } from "@/hooks/useWorkspaceRole";
import { cn } from "@/lib/utils";
import {
  createWorkspaceUserGroup,
  deleteWorkspaceUserGroup,
  fetchWorkspaceUserGroupEmails,
  fetchWorkspaceUserGroups,
  updateWorkspaceUserGroup,
  type WorkspaceUserGroup,
} from "@/lib/linkAllowlistClient";
import { normalizeEmail } from "@/lib/email";
import { createSupabaseBrowserClient } from "@/lib/supabase/browserClient";
import { showError, showSuccess, showWarning } from "@/lib/toast";
import { useGlobalStore } from "@/providers/globalStoreProvider";
import {
  PencilSimple as Pencil,
  Plus,
  SpinnerGap as Loader2,
  Trash as Trash2,
  Users,
} from "@phosphor-icons/react";

import { z } from "zod";

const parseEmails = (value: string): string[] =>
  Array.from(
    new Set(
      value
        .split(/[\n,;]+/)
        .map((entry) => normalizeEmail(entry))
        .filter((entry) => !!entry),
    ),
  );

const emailSchema = z.string().email();

const UserGroupsPage: React.FC = () => {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const currentWorkspaceId = useGlobalStore((s) => s.currentWorkspaceId);
  const { role: workspaceRole, isLoading: roleLoading } =
    useWorkspaceRole(currentWorkspaceId);
  const { membership, isLoading: membershipLoading } =
    useWorkspaceMembership(currentWorkspaceId);
  const canManageGroups =
    workspaceRole === "owner" || membership?.documentsAccess === "editor";

  const [groups, setGroups] = useState<WorkspaceUserGroup[]>([]);
  const {
    isRecentlyAdded: isRecentlyAddedGroup,
    markRecentlyAdded: markRecentlyAddedGroup,
  } = useRecentlyAddedRows();
  const [isLoadingGroups, setIsLoadingGroups] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<WorkspaceUserGroup | null>(
    null,
  );
  const [groupName, setGroupName] = useState("");
  const [groupEmails, setGroupEmails] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<WorkspaceUserGroup | null>(
    null,
  );
  const [isDeleting, setIsDeleting] = useState(false);

  const loadGroups = useCallback(async () => {
    if (!currentWorkspaceId) {
      setGroups([]);
      setIsLoadingGroups(false);
      return;
    }
    setIsLoadingGroups(true);
    try {
      const rows = await fetchWorkspaceUserGroups(supabase, currentWorkspaceId);
      setGroups(rows);
    } catch (error) {
      console.error("[user-groups] failed to load groups", error);
      showError("Failed to load user groups");
      setGroups([]);
    } finally {
      setIsLoadingGroups(false);
    }
  }, [currentWorkspaceId, supabase]);

  React.useEffect(() => {
    void loadGroups();
  }, [loadGroups]);

  const openCreateDialog = () => {
    if (!canManageGroups) {
      showWarning(
        "Only workspace owners and document editors can manage user groups.",
      );
      return;
    }
    setEditingGroup(null);
    setGroupName("");
    setGroupEmails("");
    setFormError(null);
    setDialogOpen(true);
  };

  const openEditDialog = async (group: WorkspaceUserGroup) => {
    if (!canManageGroups) {
      showWarning(
        "Only workspace owners and document editors can manage user groups.",
      );
      return;
    }
    setFormError(null);
    setEditingGroup(group);
    setGroupName(group.name);
    setDialogOpen(true);
    try {
      const emails = await fetchWorkspaceUserGroupEmails(supabase, group.id);
      setGroupEmails(emails.join("\n"));
    } catch (error) {
      console.error("[user-groups] failed to load group emails", error);
      setGroupEmails("");
      setFormError("Unable to load group members");
    }
  };

  const handleSaveGroup = async () => {
    if (!currentWorkspaceId) return;
    const trimmedName = groupName.trim();
    if (!trimmedName) {
      setFormError("Group name is required");
      return;
    }

    const emails = parseEmails(groupEmails);
    if (emails.length === 0) {
      setFormError("Add at least one email");
      return;
    }

    const invalidEmails: string[] = [];
    for (const email of emails) {
      if (!emailSchema.safeParse(email).success) {
        invalidEmails.push(email);
      }
    }

    if (invalidEmails.length > 0) {
      setFormError(
        `Invalid emails found: ${invalidEmails.slice(0, 3).join(", ")}${invalidEmails.length > 3 ? "..." : ""}`,
      );
      return;
    }

    setFormError(null);
    setIsSaving(true);
    let createdGroupId: string | null = null;
    try {
      if (editingGroup) {
        await updateWorkspaceUserGroup(supabase, {
          workspaceId: currentWorkspaceId,
          groupId: editingGroup.id,
          name: trimmedName,
          emails,
        });
        showSuccess("User group updated");
        createdGroupId = null;
      } else {
        const created = await createWorkspaceUserGroup(supabase, {
          workspaceId: currentWorkspaceId,
          name: trimmedName,
          emails,
        });
        createdGroupId = created.id;
        showSuccess("User group created");
      }
      setDialogOpen(false);
      setEditingGroup(null);
      setGroupName("");
      setGroupEmails("");
      await loadGroups();
      // Flashed after the refetch, not before: the row does not exist in this
      // list until `loadGroups` resolves.
      if (createdGroupId) {
        markRecentlyAddedGroup([createdGroupId]);
      }
    } catch (error) {
      console.error("[user-groups] save failed", error);
      setFormError("Failed to save user group");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteGroup = async () => {
    if (!deleteTarget) return;
    if (!currentWorkspaceId) return;
    setIsDeleting(true);
    try {
      await deleteWorkspaceUserGroup(supabase, {
        workspaceId: currentWorkspaceId,
        groupId: deleteTarget.id,
      });
      showSuccess("User group deleted");
      setDeleteTarget(null);
      await loadGroups();
    } catch (error) {
      console.error("[user-groups] delete failed", error);
      showError("Failed to delete user group");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <PageContainer className="mx-auto max-w-6xl space-y-6 pb-16">
      <PageHeader
        title="User groups"
        description="Create reusable email groups for link allowlists and blocklists."
        actions={
          canManageGroups ? (
            <Button onClick={openCreateDialog}>
              <Plus className="mr-2 h-4 w-4" aria-hidden />
              New group
            </Button>
          ) : undefined
        }
      />

      {roleLoading || membershipLoading || isLoadingGroups ? (
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
      ) : !canManageGroups ? (
        <SurfaceCard className="bg-card/45 [box-shadow:none]">
          <CardContent className="py-10">
            <EmptyState
              variant="bare"
              title="Access restricted"
              description="Only workspace owners and document editors can manage user groups."
              icon={
                <Users className="h-6 w-6 text-muted-foreground" aria-hidden />
              }
              compact
            />
          </CardContent>
        </SurfaceCard>
      ) : groups.length === 0 ? (
        <SurfaceCard className="bg-card/45 [box-shadow:none]">
          <CardContent className="py-10">
            <EmptyState
              variant="bare"
              title="No groups yet"
              description="Create your first group to reuse member lists when sharing links."
              icon={
                <Users className="h-6 w-6 text-muted-foreground" aria-hidden />
              }
              compact
            />
          </CardContent>
        </SurfaceCard>
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
                    Members
                  </th>
                  <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0">
                    Type
                  </th>
                  <th className="h-12 px-4 text-right align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="[&_tr:last-child]:border-0">
                {groups.map((group) => (
                  <tr
                    key={group.id}
                    className={cn(
                      "border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted",
                      isRecentlyAddedGroup(group.id) && "dk-row-flash",
                    )}
                  >
                    <td className="p-4 align-middle font-medium [&:has([role=checkbox])]:pr-0">
                      {group.name}
                    </td>
                    <td className="p-4 align-middle [&:has([role=checkbox])]:pr-0">
                      <span className="text-muted-foreground">
                        {group.emailCount} email
                        {group.emailCount === 1 ? "" : "s"}
                      </span>
                    </td>
                    <td className="p-4 align-middle [&:has([role=checkbox])]:pr-0">
                      <Badge variant="secondary">Group</Badge>
                    </td>
                    <td className="p-4 text-right align-middle [&:has([role=checkbox])]:pr-0">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0"
                          onClick={() => void openEditDialog(group)}
                        >
                          <Pencil className="h-3.5 w-3.5" aria-hidden />
                          <span className="sr-only">Edit</span>
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0"
                          onClick={() => setDeleteTarget(group)}
                        >
                          <Trash2
                            className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive"
                            aria-hidden
                          />
                          <span className="sr-only">Delete</span>
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Dialog
        open={dialogOpen}
        onOpenChange={(next) => {
          if (isSaving) return;
          setDialogOpen(next);
          if (!next) {
            setEditingGroup(null);
            setFormError(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader className="border-b border-border/60 pb-4">
            <p className="dk-nocturne-kicker">Reusable audience</p>
            <DialogTitle className="font-medium">
              {editingGroup ? "Edit user group" : "Create user group"}
            </DialogTitle>
            <DialogDescription>
              Add one email per line (commas also supported).
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="group-name">Group name</Label>
              <Input
                id="group-name"
                value={groupName}
                maxLength={120}
                onChange={(event) => setGroupName(event.target.value)}
                placeholder="Finance stakeholders"
                disabled={isSaving}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="group-emails">Emails</Label>
              <Textarea
                id="group-emails"
                value={groupEmails}
                onChange={(event) => setGroupEmails(event.target.value)}
                placeholder={"alice@company.com\nbob@company.com"}
                rows={8}
                disabled={isSaving}
              />
            </div>
            {formError ? (
              <p className="text-sm text-destructive">{formError}</p>
            ) : null}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => void handleSaveGroup()}
              disabled={isSaving}
            >
              {isSaving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
              ) : null}
              {editingGroup ? "Save changes" : "Create group"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(next) => {
          if (!next) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete group?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget
                ? `This permanently removes "${deleteTarget.name}" and its member emails from all links and presets.`
                : "This action cannot be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={isDeleting}
              onClick={(event) => {
                event.preventDefault();
                void handleDeleteGroup();
              }}
            >
              {isDeleting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
              ) : null}
              Delete group
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageContainer>
  );
};

export default UserGroupsPage;
