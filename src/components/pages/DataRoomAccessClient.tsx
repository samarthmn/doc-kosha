"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import { PageContainer } from "@/components/ui/page-container";
import { PageHeader } from "@/components/ui/page-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { createSupabaseBrowserClient } from "@/lib/supabase/browserClient";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { showError, showSuccess } from "@/lib/toast";
import {
  WorkspaceMemberAccessFields,
  type AccessLevel,
  type RoomAccessLevel,
  type WorkspaceDataRoomOption,
  type WorkspaceRolePreset,
} from "@/components/workspace/WorkspaceMemberAccessFields";
import { useDataRoom } from "@/modules/data-rooms/DataRoomProvider";
import {
  ArrowLeft,
  ArrowsClockwise as RotateCw,
  SpinnerGap as Loader2,
  UserPlus as MailPlus,
  UsersThree as Users,
} from "@phosphor-icons/react";
import { isValidEmail } from "@/lib/validators/email";

type AccessSource = "owner" | "all_data_rooms" | "explicit" | "none";

type AccessMember = {
  id: string;
  type: "member" | "invite";
  userId?: string;
  email: string | null;
  name: string | null;
  isOwner: boolean;
  documentsAccess: AccessLevel;
  dataRoomsAccessAll: AccessLevel;
  explicitAccessLevel: AccessLevel;
  effectiveAccessLevel: AccessLevel;
  accessSource: AccessSource;
  invitedAt?: string;
};

type AccessSnapshot = {
  members: AccessMember[];
  dataRoom?: { id: string; name: string | null; workspaceId: string };
  error?: string;
};

const DataRoomAccessClient: React.FC = () => {
  const router = useRouter();
  const { dataRoom } = useDataRoom();
  const [isPending, startTransition] = useTransition();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const workspaceId = dataRoom.workspace_id;

  const [members, setMembers] = useState<AccessMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mutatingUserId, setMutatingUserId] = useState<string | null>(null);

  const [rolePresets, setRolePresets] = useState<WorkspaceRolePreset[]>([]);
  const [isLoadingRolePresets, setIsLoadingRolePresets] = useState(false);

  const [workspaceDataRooms, setWorkspaceDataRooms] = useState<
    WorkspaceDataRoomOption[]
  >(() => [{ id: dataRoom.id, name: dataRoom.name ?? null }]);
  const [isLoadingDataRooms, setIsLoadingDataRooms] = useState(false);

  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteDocumentsAccess, setInviteDocumentsAccess] =
    useState<AccessLevel>("viewer");
  const [inviteDataRoomsAccessAll, setInviteDataRoomsAccessAll] =
    useState<AccessLevel>("none");
  const [inviteRoomAccess, setInviteRoomAccess] = useState<
    Record<string, RoomAccessLevel>
  >({});
  const [isInviting, setIsInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);

  const inviteEmailTrimmed = inviteEmail.trim();
  const isInviteEmailValid = useMemo(
    () => (inviteEmailTrimmed ? isValidEmail(inviteEmailTrimmed) : true),
    [inviteEmailTrimmed],
  );

  const resetInviteForm = useCallback(() => {
    setInviteError(null);
    setInviteEmail("");
    setInviteDocumentsAccess("viewer");
    setInviteDataRoomsAccessAll("none");
    setInviteRoomAccess({ [dataRoom.id]: "viewer" });
  }, [dataRoom.id]);

  const loadAccessSnapshot = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const res = await fetch("/api/data-rooms/access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dataRoomId: dataRoom.id }),
      });
      const payload = (await res
        .json()
        .catch(() => null)) as AccessSnapshot | null;
      if (!res.ok) {
        setLoadError(payload?.error || "Failed to load access list.");
        setMembers([]);
        return;
      }
      setMembers(payload?.members ?? []);
    } catch (error) {
      console.error("[data-room-access] load failed", error);
      setLoadError("Failed to load access list.");
      setMembers([]);
    } finally {
      setIsLoading(false);
    }
  }, [dataRoom.id]);

  useEffect(() => {
    void loadAccessSnapshot();
  }, [loadAccessSnapshot]);

  useEffect(() => {
    let active = true;
    const loadRolePresets = async () => {
      if (!workspaceId) {
        if (active) {
          setRolePresets([]);
          setIsLoadingRolePresets(false);
        }
        return;
      }

      setIsLoadingRolePresets(true);
      try {
        const res = await fetch(
          `/api/settings/workspace-role-presets?workspaceId=${workspaceId}`,
        );
        const payload = (await res.json().catch(() => null)) as {
          presets?: WorkspaceRolePreset[];
          error?: string;
        } | null;

        if (!active) return;
        if (!res.ok) {
          setRolePresets([]);
          return;
        }

        setRolePresets(payload?.presets ?? []);
      } catch (error) {
        console.error("[data-room-access] role presets fetch failed", error);
        if (active) {
          setRolePresets([]);
        }
      } finally {
        if (active) setIsLoadingRolePresets(false);
      }
    };

    void loadRolePresets();
    return () => {
      active = false;
    };
  }, [workspaceId]);

  useEffect(() => {
    let active = true;
    const loadRooms = async () => {
      if (!workspaceId) {
        if (active) {
          setWorkspaceDataRooms([]);
          setIsLoadingDataRooms(false);
        }
        return;
      }

      setIsLoadingDataRooms(true);
      try {
        const { data, error } = await supabase
          .from("data_rooms")
          .select("id,name")
          .eq("workspace_id", workspaceId)
          .order("name");

        if (!active) return;
        if (error) {
          console.error("[data-room-access] data rooms fetch failed", error);
          setWorkspaceDataRooms([]);
          return;
        }

        setWorkspaceDataRooms(
          (data ?? []).map((row) => ({
            id: row.id,
            name: (row as { name?: string | null }).name ?? null,
          })),
        );
      } catch (error) {
        console.error("[data-room-access] data rooms fetch failed", error);
        if (active) setWorkspaceDataRooms([]);
      } finally {
        if (active) setIsLoadingDataRooms(false);
      }
    };

    void loadRooms();
    return () => {
      active = false;
    };
  }, [supabase, workspaceId]);

  useEffect(() => {
    resetInviteForm();
  }, [resetInviteForm]);

  const setExplicitAccessLevel = useCallback(
    async (member: AccessMember, accessLevel: AccessLevel) => {
      if (!member?.userId) return;
      if (member.isOwner) return;

      setMutatingUserId(member.userId);
      try {
        const res = await fetch("/api/data-rooms/access", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            dataRoomId: dataRoom.id,
            userId: member.userId,
            accessLevel,
          }),
        });
        const payload = (await res.json().catch(() => null)) as {
          ok?: boolean;
          error?: string;
        } | null;
        if (!res.ok) {
          showError(payload?.error || "Unable to update access.");
          return;
        }

        setMembers((prev) =>
          prev.map((row) => {
            if (row.userId !== member.userId) return row;
            const explicitAccessLevel = accessLevel;
            const effectiveAccessLevel: AccessLevel = row.isOwner
              ? "editor"
              : row.dataRoomsAccessAll !== "none"
                ? row.dataRoomsAccessAll
                : explicitAccessLevel !== "none"
                  ? explicitAccessLevel
                  : "none";
            const accessSource: AccessSource = row.isOwner
              ? "owner"
              : row.dataRoomsAccessAll !== "none"
                ? "all_data_rooms"
                : explicitAccessLevel !== "none"
                  ? "explicit"
                  : "none";
            return {
              ...row,
              explicitAccessLevel,
              effectiveAccessLevel,
              accessSource,
            };
          }),
        );

        showSuccess("Access updated");
      } catch (error) {
        console.error("[data-room-access] mutation failed", error);
        showError("Unable to update access.");
      } finally {
        setMutatingUserId(null);
      }
    },
    [dataRoom.id],
  );

  const handleInvite = useCallback(async () => {
    if (!inviteEmailTrimmed || !isInviteEmailValid) {
      setInviteError("Enter a valid email.");
      showError("Enter a valid email.");
      return;
    }
    setIsInviting(true);
    setInviteError(null);
    try {
      const dataRooms = Object.entries(inviteRoomAccess).map(
        ([dataRoomId, accessLevel]) => ({
          dataRoomId,
          accessLevel,
        }),
      );
      if (!dataRooms.some((r) => r.dataRoomId === dataRoom.id)) {
        dataRooms.push({ dataRoomId: dataRoom.id, accessLevel: "viewer" });
      }

      const res = await fetch("/api/data-rooms/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dataRoomId: dataRoom.id,
          email: inviteEmailTrimmed,
          documentsAccess: inviteDocumentsAccess,
          dataRoomsAccessAll: inviteDataRoomsAccessAll,
          dataRooms,
        }),
      });
      const payload = (await res.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
        message?: string;
      } | null;
      if (!res.ok) {
        const message = payload?.error || "Failed to send invite.";
        setInviteError(message);
        showError(message);
        return;
      }
      showSuccess(payload?.message || "Invite sent");
      resetInviteForm();
      setInviteDialogOpen(false);
      startTransition(() => {
        void loadAccessSnapshot();
      });
    } catch (error) {
      console.error("[data-room-access] invite failed", error);
      setInviteError("Failed to send invite.");
      showError("Failed to send invite.");
    } finally {
      setIsInviting(false);
    }
  }, [
    dataRoom.id,
    inviteEmailTrimmed,
    inviteDocumentsAccess,
    inviteDataRoomsAccessAll,
    inviteRoomAccess,
    isInviteEmailValid,
    loadAccessSnapshot,
    resetInviteForm,
    startTransition,
  ]);

  const accessCount = useMemo(
    () => members.filter((m) => m.effectiveAccessLevel !== "none").length,
    [members],
  );

  return (
    <PageContainer maxWidth="7xl" className="pb-24 md:pb-10">
      <Button
        variant="ghost"
        size="sm"
        className="mb-3 w-fit px-1 text-muted-foreground hover:text-foreground"
        onClick={() => router.push(`/data-rooms/${dataRoom.id}/documents`)}
      >
        <ArrowLeft className="mr-2 h-4 w-4" aria-hidden />
        Back to data room
      </Button>
      <PageHeader
        title="Access"
        description={`Manage who can access “${dataRoom.name || "Data Room"}”. Owner access is always granted.`}
        actions={
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
            <Button
              type="button"
              variant="outline"
              onClick={() => void loadAccessSnapshot()}
              disabled={isLoading || isPending}
            >
              {isLoading ? (
                <Loader2
                  className="mr-2 h-4 w-4 animate-spin motion-reduce:animate-none"
                  aria-hidden
                />
              ) : (
                <RotateCw className="mr-2 h-4 w-4" aria-hidden />
              )}
              Refresh
            </Button>
            <Button onClick={() => setInviteDialogOpen(true)}>
              <MailPlus className="mr-2 h-4 w-4" aria-hidden />
              Invite Member
            </Button>
          </div>
        }
      />

      <div className="mt-6">
        <Card className="bg-card/35 [box-shadow:none]">
          <CardHeader className="border-b border-border/60 pb-4">
            <CardTitle className="flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" aria-hidden />
              Room Members
              <Badge variant="secondary" className="ml-2 tabular-nums">
                {accessCount}/{members.length}
              </Badge>
            </CardTitle>
            <CardDescription>
              Owners always have access. Non-owners can access this room via
              workspace “All data rooms” access or an explicit room override.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center p-8">
                <Loader2
                  className="h-6 w-6 animate-spin text-muted-foreground motion-reduce:animate-none"
                  aria-hidden
                />
              </div>
            ) : loadError ? (
              <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-center">
                <p className="text-sm font-medium">Unable to load access</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {loadError}
                </p>
              </div>
            ) : members.length === 0 ? (
              <EmptyState
                variant="bare"
                compact
                icon={
                  <Users
                    className="h-6 w-6 text-muted-foreground"
                    aria-hidden
                  />
                }
                title="No members found"
                description="Invite a member to grant them access to this data room."
              />
            ) : (
              <div className="divide-y divide-border/50 overflow-hidden rounded-lg border border-border/70 bg-card/25">
                {members.map((member) => {
                  const isOwner = member.isOwner;
                  const statusLabel = isOwner
                    ? "Owner"
                    : member.accessSource === "all_data_rooms"
                      ? `All data rooms (${member.dataRoomsAccessAll})`
                      : member.accessSource === "explicit"
                        ? `Explicit (${member.explicitAccessLevel})`
                        : "No access";
                  const isBusy = mutatingUserId === member.userId || isPending;
                  const isInvite = member.type === "invite";

                  return (
                    <div
                      key={member.id}
                      className="flex flex-col gap-4 p-4 transition-colors hover:bg-primary/[0.025] sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="flex items-center gap-4">
                        <Avatar className="h-10 w-10 border border-primary/20 bg-primary/10">
                          <AvatarFallback className="text-sm">
                            {(member.name || member.email || "?")
                              .slice(0, 2)
                              .toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <p className="text-sm leading-none font-medium wrap-break-word">
                              {member.name || member.email || "Unknown user"}
                            </p>
                            {isOwner ? (
                              <Badge
                                variant="secondary"
                                className="h-5 px-1.5 text-[10px] capitalize"
                              >
                                Owner
                              </Badge>
                            ) : isInvite ? (
                              <Badge
                                variant="outline"
                                className="h-5 px-1.5 text-[10px] text-muted-foreground capitalize"
                              >
                                Pending Invite
                              </Badge>
                            ) : (
                              <Badge
                                variant="secondary"
                                className="h-5 px-1.5 text-[10px] capitalize"
                              >
                                Member
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {member.email}
                          </p>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground/80">
                            <span>Docs: {member.documentsAccess}</span>
                            <span className="text-border">|</span>
                            <span>{statusLabel}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-3 pl-14 sm:flex-nowrap sm:pl-0">
                        {mutatingUserId === member.userId && (
                          <span className="animate-pulse text-xs text-muted-foreground motion-reduce:animate-none">
                            Saving...
                          </span>
                        )}
                        {isOwner ? (
                          <Badge variant="outline">Owner Access</Badge>
                        ) : isInvite ? (
                          <span className="text-xs text-muted-foreground italic">
                            Invite pending
                          </span>
                        ) : (
                          <div className="flex flex-wrap items-center gap-2">
                            <Label className="text-xs font-normal text-muted-foreground">
                              Explicit access:
                            </Label>
                            <Select
                              value={member.explicitAccessLevel}
                              onValueChange={(v) =>
                                void setExplicitAccessLevel(
                                  member,
                                  v as AccessLevel,
                                )
                              }
                              disabled={isBusy}
                            >
                              <SelectTrigger className="h-8 w-[140px]">
                                <SelectValue placeholder="Access" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">None</SelectItem>
                                <SelectItem value="viewer">Viewer</SelectItem>
                                <SelectItem value="editor">Editor</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog
        open={inviteDialogOpen}
        onOpenChange={(open) => {
          setInviteDialogOpen(open);
          if (open) resetInviteForm();
        }}
      >
        <DialogContent className="max-h-[85vh] w-[92vw] max-w-2xl overflow-y-auto overscroll-contain">
          <DialogHeader>
            <DialogTitle>Invite by Email</DialogTitle>
            <DialogDescription>
              Invite someone to the workspace and grant access to this data
              room. Presets are apply-only and won’t stay linked after you send
              the invite.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="dr-invite-email">Email</Label>
              <Input
                id="dr-invite-email"
                type="email"
                placeholder="viewer@company.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                spellCheck={false}
                disabled={isInviting}
                className="bg-card/35"
                aria-invalid={
                  !isInviteEmailValid && inviteEmailTrimmed ? true : undefined
                }
              />
              {!isInviteEmailValid && inviteEmailTrimmed ? (
                <p className="text-xs text-destructive">Enter a valid email.</p>
              ) : null}
            </div>

            {isLoadingRolePresets || isLoadingDataRooms ? (
              <p className="text-xs text-muted-foreground">
                Loading access options…
              </p>
            ) : null}

            <WorkspaceMemberAccessFields
              idPrefix="dr-invite"
              disabled={isInviting}
              rolePresets={rolePresets}
              workspaceDataRooms={workspaceDataRooms}
              documentsAccess={inviteDocumentsAccess}
              onDocumentsAccessChange={(next) => setInviteDocumentsAccess(next)}
              dataRoomsAccessAll={inviteDataRoomsAccessAll}
              onDataRoomsAccessAllChange={(next) =>
                setInviteDataRoomsAccessAll(next)
              }
              roomAccess={inviteRoomAccess}
              onRoomAccessChange={(next) => setInviteRoomAccess(next)}
              lockedDataRoomId={dataRoom.id}
              lockedDataRoomDefaultLevel="viewer"
              disablePresetsMissingLockedRoom
            />

            {inviteError ? (
              <p className="text-sm text-destructive">{inviteError}</p>
            ) : null}
          </div>

          <DialogFooter className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setInviteDialogOpen(false)}
              disabled={isInviting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => void handleInvite()}
              disabled={
                isInviting || !inviteEmailTrimmed || !isInviteEmailValid
              }
            >
              {isInviting ? (
                <Loader2
                  className="mr-2 h-4 w-4 animate-spin motion-reduce:animate-none"
                  aria-hidden
                />
              ) : (
                <MailPlus className="mr-2 h-4 w-4" aria-hidden />
              )}
              Send invite
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
};

export default DataRoomAccessClient;
