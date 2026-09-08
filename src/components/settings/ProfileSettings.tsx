"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button, buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { createSupabaseBrowserClient } from "@/lib/supabase/browserClient";
import { useGlobalStore } from "@/providers/globalStoreProvider";
import type { TablesInsert } from "@/types/generated/supabase";
import { showError, showSuccess } from "@/lib/toast";
import { useWorkspaceRole } from "@/hooks/useWorkspaceRole";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { SettingsSection } from "@/components/settings/SettingsSection";
import {
  Buildings as Building2,
  GlobeHemisphereWest as Globe2,
  Users,
  SealCheck as BadgeCheck,
  ShieldCheck,
  XCircle,
  UserMinus,
  Trash as Trash2,
  Warning as AlertTriangle,
  UserPlus,
  SlidersHorizontal as Settings2,
  FileText,
  Eye,
  Folder,
  Pencil,
  Plus,
  Star,
} from "@phosphor-icons/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useReviewModal } from "@/modules/reviews";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { canUseCustomDomain } from "@/modules/custom-domains/entitlements";
import { WorkspaceMemberAccessFields } from "@/components/workspace/WorkspaceMemberAccessFields";
import { isValidEmail } from "@/lib/validators/email";

const LETTERS_AND_SPACES_REGEX = /^[A-Za-z ]+$/;

const sanitizeWorkspaceName = (value: string): string =>
  value ? value.replace(/[^A-Za-z ]/gi, "").replace(/\s+/g, " ") : "";

type AccessDataRoom = {
  id: string;
  name: string | null;
  access_level?: RoomAccessLevel;
};

type AccessLevel = "none" | "viewer" | "editor";
type RoomAccessLevel = "viewer" | "editor";

type WorkspaceRolePreset = {
  id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  documents_access: AccessLevel;
  data_rooms_access_all: AccessLevel;
  rooms: Array<{ dataRoomId: string; accessLevel: RoomAccessLevel }>;
};

type WorkspaceMemberRow = {
  user_id: string;
  is_owner: boolean;
  email: string | null;
  name: string | null;
  documents_access: AccessLevel;
  data_rooms_access_all: AccessLevel;
  explicit_data_room_ids: string[];
  explicit_data_rooms: AccessDataRoom[];
};

type WorkspaceInviteRow = {
  id: string;
  email: string;
  invited_at: string;
  accepted_at: string | null;
  accepted_by: string | null;
  revoked_at: string | null;
  rejected_at: string | null;
  rejected_by: string | null;
  expires_at: string | null;
  documents_access: AccessLevel;
  data_rooms_access_all: AccessLevel;
  explicit_data_room_ids: string[];
  explicit_data_rooms: AccessDataRoom[];
};

type MembersApiResponse = {
  members?: WorkspaceMemberRow[];
  invites?: WorkspaceInviteRow[];
  viewerIsOwner?: boolean;
};

type PersonStatus = "accepted" | "pending" | "revoked" | "rejected" | "expired";

type PersonRow = {
  id: string;
  type: "member" | "invite";
  name: string | null;
  email: string | null;
  isOwner: boolean;
  status: PersonStatus;
  invitedAt?: string | null;
  documentsAccess: AccessLevel;
  dataRoomsAccessAll: AccessLevel;
  explicitDataRooms: AccessDataRoom[];
};

const ProfileSettings: React.FC = () => {
  const router = useRouter();
  const { openReviewModal } = useReviewModal();
  const authUser = useGlobalStore((s) => s.authUser);
  const setAuthUser = useGlobalStore((s) => s.setAuthUser);
  const setIsAuthenticated = useGlobalStore((s) => s.setIsAuthenticated);
  const userProfile = useGlobalStore((s) => s.userProfile);
  const setUserProfile = useGlobalStore((s) => s.setUserProfile);
  const currentWorkspaceSubscription = useGlobalStore(
    (s) => s.currentWorkspaceSubscription,
  );
  const workspaces = useGlobalStore((s) => s.workspaces);
  const setWorkspaces = useGlobalStore((s) => s.setWorkspaces);
  const setCurrentWorkspaceId = useGlobalStore((s) => s.setCurrentWorkspaceId);
  const setCurrentWorkspaceSubscription = useGlobalStore(
    (s) => s.setCurrentWorkspaceSubscription,
  );
  const setIsUserOnboarded = useGlobalStore((s) => s.setIsUserOnboarded);
  const customDomainsEnabled = useMemo(
    () => canUseCustomDomain(currentWorkspaceSubscription),
    [currentWorkspaceSubscription],
  );
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [fullName, setFullName] = useState<string>("");
  const [company, setCompany] = useState<string>("");
  const [workspaceName, setWorkspaceName] = useState<string>("");
  const [verifiedDomain, setVerifiedDomain] = useState<string | null>(null);
  const currentWorkspaceId = useGlobalStore((s) => s.currentWorkspaceId);
  const { role: workspaceRole } = useWorkspaceRole(currentWorkspaceId);
  const [members, setMembers] = useState<WorkspaceMemberRow[]>([]);
  const [invites, setInvites] = useState<WorkspaceInviteRow[]>([]);
  const [rolePresets, setRolePresets] = useState<WorkspaceRolePreset[]>([]);
  const [isLoadingRolePresets, setIsLoadingRolePresets] = useState(false);
  const [rolePresetsError, setRolePresetsError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isInviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteDocumentsAccess, setInviteDocumentsAccess] =
    useState<AccessLevel>("viewer");
  const [inviteDataRoomsAccessAll, setInviteDataRoomsAccessAll] =
    useState<AccessLevel>("none");
  const [inviteRoomAccess, setInviteRoomAccess] = useState<
    Record<string, RoomAccessLevel>
  >({});
  const [workspaceDataRooms, setWorkspaceDataRooms] = useState<
    Array<{ id: string; name: string | null }>
  >([]);
  const [isLoadingDataRooms, setIsLoadingDataRooms] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [isInviteSubmitting, setIsInviteSubmitting] = useState(false);
  const [removingMemberId, setRemovingMemberId] = useState<string | null>(null);
  const [isEditAccessDialogOpen, setEditAccessDialogOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<WorkspaceMemberRow | null>(
    null,
  );
  const [editDocumentsAccess, setEditDocumentsAccess] =
    useState<AccessLevel>("none");
  const [editDataRoomsAccessAll, setEditDataRoomsAccessAll] =
    useState<AccessLevel>("none");
  const [editRoomAccess, setEditRoomAccess] = useState<
    Record<string, RoomAccessLevel>
  >({});
  const [isEditAccessSubmitting, setIsEditAccessSubmitting] = useState(false);
  const [editAccessError, setEditAccessError] = useState<string | null>(null);

  const [isRolePresetDialogOpen, setIsRolePresetDialogOpen] = useState(false);
  const [rolePresetsManagerStep, setRolePresetsManagerStep] = useState<
    "list" | "form"
  >("list");
  const [editingRolePreset, setEditingRolePreset] =
    useState<WorkspaceRolePreset | null>(null);
  const [rolePresetName, setRolePresetName] = useState("");
  const [rolePresetDescription, setRolePresetDescription] = useState("");
  const [rolePresetDocumentsAccess, setRolePresetDocumentsAccess] =
    useState<AccessLevel>("none");
  const [rolePresetDataRoomsAccessAll, setRolePresetDataRoomsAccessAll] =
    useState<AccessLevel>("none");
  const [rolePresetRoomAccess, setRolePresetRoomAccess] = useState<
    Record<string, RoomAccessLevel>
  >({});
  const [isRolePresetSubmitting, setIsRolePresetSubmitting] = useState(false);
  const [rolePresetSubmitError, setRolePresetSubmitError] = useState<
    string | null
  >(null);

  // Account deletion state
  const [isDeleteAccountDialogOpen, setDeleteAccountDialogOpen] =
    useState(false);
  const [deleteAccountConfirmation, setDeleteAccountConfirmation] =
    useState("");
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);

  // Workspace deletion state (owner only)
  const [isDeleteWorkspaceDialogOpen, setDeleteWorkspaceDialogOpen] =
    useState(false);
  const [deleteWorkspaceConfirmation, setDeleteWorkspaceConfirmation] =
    useState("");
  const [isDeletingWorkspace, setIsDeletingWorkspace] = useState(false);
  const inviteEmailTrimmed = inviteEmail.trim();
  const isInviteEmailValid = useMemo(
    () =>
      inviteEmailTrimmed.length === 0 ? true : isValidEmail(inviteEmailTrimmed),
    [inviteEmailTrimmed],
  );

  const openRolePresetsManager = useCallback(() => {
    setRolePresetsManagerStep("list");
    setIsRolePresetDialogOpen(true);
  }, []);

  const [baseline, setBaseline] = useState<{
    fullName: string;
    company: string;
    workspaceName: string;
  }>({
    fullName: "",
    company: "",
    workspaceName: "",
  });

  useEffect(() => {
    const b = {
      fullName: (userProfile?.full_name || "").trim(),
      company: userProfile?.company || "",
      workspaceName: "",
    };
    setBaseline(b);
    setFullName(b.fullName);
    setCompany(b.company);
  }, [userProfile]);

  const isDirty = useMemo(() => {
    const b = baseline;
    return (
      b.fullName !== fullName ||
      b.company !== company ||
      b.workspaceName !== workspaceName
    );
  }, [fullName, company, workspaceName, baseline]);

  const workspaceNameError = useMemo(() => {
    const trimmed = workspaceName.trim();
    if (!trimmed) return null;
    if (!LETTERS_AND_SPACES_REGEX.test(trimmed)) {
      return "Workspace name can include letters (A-Z) and spaces only.";
    }
    if (trimmed.length < 3) {
      return "Workspace name must be at least 3 letters.";
    }
    return null;
  }, [workspaceName]);

  const updateMembersFromSnapshot = useCallback(
    (snapshot: MembersApiResponse | null) => {
      if (!snapshot) {
        setMembers([]);
        setInvites([]);
        return;
      }
      setMembers(snapshot.members ?? []);
      setInvites(snapshot.invites ?? []);
    },
    [],
  );

  const fetchMembersSnapshot = useCallback(async () => {
    if (!currentWorkspaceId) {
      return null;
    }
    try {
      const res = await fetch("/api/settings/workspace-members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId: currentWorkspaceId }),
      });
      if (!res.ok) {
        return null;
      }
      return ((await res.json()) as MembersApiResponse) ?? null;
    } catch {
      return null;
    }
  }, [currentWorkspaceId]);

  const refreshMembersData = useCallback(async () => {
    const snapshot = await fetchMembersSnapshot();
    updateMembersFromSnapshot(snapshot);
  }, [fetchMembersSnapshot, updateMembersFromSnapshot]);

  useEffect(() => {
    let active = true;
    const loadWorkspace = async () => {
      if (!currentWorkspaceId) {
        setWorkspaceName("");
        setVerifiedDomain(null);
        updateMembersFromSnapshot(null);
        return;
      }
      try {
        // Workspaces basic info
        const { data: ws } = await supabase
          .from("workspaces")
          .select("id,name,active_custom_domain_id")
          .eq("id", currentWorkspaceId)
          .maybeSingle();
        if (ws && active) {
          const loadedName = sanitizeWorkspaceName(
            (ws as { name?: string | null })?.name || "",
          );
          setWorkspaceName(loadedName);
          // Align baseline for workspace fields so Save is disabled until user edits
          setBaseline((prev) => ({
            ...prev,
            workspaceName: loadedName,
          }));
        }
        // Domain info
        const domainId = (
          ws as { active_custom_domain_id?: string | null } | null
        )?.active_custom_domain_id;
        if (customDomainsEnabled && domainId && active) {
          const { data: cd } = await supabase
            .from("custom_domains")
            .select("domain,status")
            .eq("id", domainId)
            .maybeSingle();
          const row = cd as {
            domain?: string | null;
            status?: string;
          } | null;
          if (row?.status === "verified" && row?.domain) {
            setVerifiedDomain(row.domain);
          } else {
            setVerifiedDomain(null);
          }
        } else {
          setVerifiedDomain(null);
        }
        const snapshot =
          workspaceRole === "owner" ? await fetchMembersSnapshot() : null;
        if (active) {
          updateMembersFromSnapshot(snapshot);
        }
      } catch {
        if (active) {
          setVerifiedDomain(null);
          updateMembersFromSnapshot(null);
        }
      }
    };
    void loadWorkspace();
    return () => {
      active = false;
    };
  }, [
    supabase,
    customDomainsEnabled,
    currentWorkspaceId,
    fetchMembersSnapshot,
    updateMembersFromSnapshot,
    workspaceRole,
  ]);

  useEffect(() => {
    let active = true;
    const loadDataRooms = async () => {
      if (!currentWorkspaceId || workspaceRole !== "owner") {
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
          .eq("workspace_id", currentWorkspaceId)
          .order("name");

        if (!active) return;
        if (error) {
          console.error("[settings] data rooms fetch failed", error);
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
        console.error("[settings] data rooms fetch failed", error);
        if (active) setWorkspaceDataRooms([]);
      } finally {
        if (active) setIsLoadingDataRooms(false);
      }
    };

    void loadDataRooms();
    return () => {
      active = false;
    };
  }, [currentWorkspaceId, supabase, workspaceRole]);

  const refreshRolePresets = useCallback(async () => {
    if (!currentWorkspaceId || workspaceRole !== "owner") {
      setRolePresets([]);
      setIsLoadingRolePresets(false);
      setRolePresetsError(null);
      return;
    }

    setIsLoadingRolePresets(true);
    setRolePresetsError(null);

    try {
      const res = await fetch(
        `/api/settings/workspace-role-presets?workspaceId=${currentWorkspaceId}`,
      );
      const payload = (await res.json().catch(() => null)) as {
        presets?: WorkspaceRolePreset[];
        error?: string;
      } | null;

      if (!res.ok) {
        setRolePresets([]);
        setRolePresetsError(payload?.error || "Failed to load role presets.");
        return;
      }

      setRolePresets(payload?.presets ?? []);
    } catch (error) {
      console.error("[settings] role presets fetch failed", error);
      setRolePresets([]);
      setRolePresetsError("Failed to load role presets.");
    } finally {
      setIsLoadingRolePresets(false);
    }
  }, [currentWorkspaceId, workspaceRole]);

  useEffect(() => {
    void refreshRolePresets();
  }, [refreshRolePresets]);

  const openNewRolePresetDialog = useCallback(() => {
    setEditingRolePreset(null);
    setRolePresetName("");
    setRolePresetDescription("");
    setRolePresetDocumentsAccess("none");
    setRolePresetDataRoomsAccessAll("none");
    setRolePresetRoomAccess({});
    setRolePresetSubmitError(null);
    setRolePresetsManagerStep("form");
    setIsRolePresetDialogOpen(true);
  }, []);

  const openEditRolePresetDialog = useCallback(
    (preset: WorkspaceRolePreset) => {
      setEditingRolePreset(preset);
      setRolePresetName(preset.name ?? "");
      setRolePresetDescription(preset.description ?? "");
      setRolePresetDocumentsAccess(preset.documents_access);
      setRolePresetDataRoomsAccessAll(preset.data_rooms_access_all);
      const map: Record<string, RoomAccessLevel> = {};
      (preset.rooms ?? []).forEach((r) => {
        if (!r?.dataRoomId) return;
        map[r.dataRoomId] = r.accessLevel;
      });
      setRolePresetRoomAccess(map);
      setRolePresetSubmitError(null);
      setRolePresetsManagerStep("form");
      setIsRolePresetDialogOpen(true);
    },
    [],
  );

  const handleRolePresetDialogOpenChange = useCallback((open: boolean) => {
    setIsRolePresetDialogOpen(open);
    if (!open) {
      setRolePresetSubmitError(null);
      setIsRolePresetSubmitting(false);
      setEditingRolePreset(null);
      setRolePresetsManagerStep("list");
    }
  }, []);

  const saveRolePreset = useCallback(async () => {
    if (!currentWorkspaceId) return;
    const name = rolePresetName.trim();
    if (!name) {
      setRolePresetSubmitError("Preset name is required.");
      return;
    }

    setIsRolePresetSubmitting(true);
    setRolePresetSubmitError(null);

    const dataRooms =
      rolePresetDataRoomsAccessAll === "none"
        ? Object.entries(rolePresetRoomAccess).map(
            ([dataRoomId, accessLevel]) => ({
              dataRoomId,
              accessLevel,
            }),
          )
        : [];

    try {
      const res = await fetch("/api/settings/workspace-role-presets", {
        method: editingRolePreset ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          editingRolePreset
            ? {
                workspaceId: currentWorkspaceId,
                presetId: editingRolePreset.id,
                name,
                description: rolePresetDescription.trim() || null,
                documentsAccess: rolePresetDocumentsAccess,
                dataRoomsAccessAll: rolePresetDataRoomsAccessAll,
                dataRooms,
              }
            : {
                workspaceId: currentWorkspaceId,
                name,
                description: rolePresetDescription.trim() || null,
                documentsAccess: rolePresetDocumentsAccess,
                dataRoomsAccessAll: rolePresetDataRoomsAccessAll,
                dataRooms,
              },
        ),
      });

      const payload = (await res.json().catch(() => null)) as {
        preset?: WorkspaceRolePreset;
        error?: string;
      } | null;

      if (!res.ok) {
        setRolePresetSubmitError(payload?.error || "Failed to save preset.");
        return;
      }

      showSuccess(editingRolePreset ? "Preset updated" : "Preset created");
      setRolePresetsManagerStep("list");
      setEditingRolePreset(null);
      await refreshRolePresets();
    } catch (error) {
      console.error("[settings] preset save failed", error);
      setRolePresetSubmitError("Failed to save preset.");
    } finally {
      setIsRolePresetSubmitting(false);
    }
  }, [
    currentWorkspaceId,
    editingRolePreset,
    refreshRolePresets,
    rolePresetDataRoomsAccessAll,
    rolePresetDescription,
    rolePresetDocumentsAccess,
    rolePresetName,
    rolePresetRoomAccess,
  ]);

  const deleteRolePreset = useCallback(
    async (presetId: string) => {
      if (!currentWorkspaceId) return;
      try {
        const res = await fetch("/api/settings/workspace-role-presets", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ workspaceId: currentWorkspaceId, presetId }),
        });
        const payload = (await res.json().catch(() => null)) as {
          ok?: boolean;
          error?: string;
        } | null;
        if (!res.ok) {
          showError(payload?.error || "Failed to delete preset.");
          return;
        }
        showSuccess("Preset deleted");
        await refreshRolePresets();
      } catch (error) {
        console.error("[settings] preset delete failed", error);
        showError("Failed to delete preset.");
      }
    },
    [currentWorkspaceId, refreshRolePresets],
  );

  const handleInviteDialogOpenChange = useCallback((open: boolean) => {
    setInviteDialogOpen(open);
    if (open) {
      setInviteError(null);
      setInviteEmail("");
      setInviteDocumentsAccess("viewer");
      setInviteDataRoomsAccessAll("none");
      setInviteRoomAccess({});
      return;
    }
    setInviteEmail("");
    setInviteDocumentsAccess("viewer");
    setInviteDataRoomsAccessAll("none");
    setInviteRoomAccess({});
    setInviteError(null);
  }, []);

  const handleInviteSubmit = async () => {
    if (!currentWorkspaceId || isInviteSubmitting) return;
    if (!inviteEmailTrimmed) {
      setInviteError("Email is required");
      return;
    }
    if (!isValidEmail(inviteEmailTrimmed)) {
      setInviteError("Enter a valid email address");
      return;
    }
    setIsInviteSubmitting(true);
    setInviteError(null);
    try {
      const inviteDataRooms =
        inviteDataRoomsAccessAll === "none"
          ? Object.entries(inviteRoomAccess).map(
              ([dataRoomId, accessLevel]) => ({
                dataRoomId,
                accessLevel,
              }),
            )
          : [];
      const res = await fetch("/api/settings/workspace-invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId: currentWorkspaceId,
          email: inviteEmailTrimmed,
          documentsAccess: inviteDocumentsAccess,
          dataRoomsAccessAll: inviteDataRoomsAccessAll,
          dataRooms:
            inviteDataRoomsAccessAll === "none" ? inviteDataRooms : undefined,
        }),
      });
      const payload = (await res.json().catch(() => null)) as {
        error?: string;
      } | null;
      if (!res.ok) {
        throw new Error(payload?.error || "Failed to send invite");
      }
      showSuccess("Invite sent");
      handleInviteDialogOpenChange(false);
      await refreshMembersData();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to send invite";
      setInviteError(message);
      showError(message);
    } finally {
      setIsInviteSubmitting(false);
    }
  };

  const handleRevokeInvite = async (inviteId: string) => {
    if (!currentWorkspaceId) return;
    try {
      const res = await fetch("/api/settings/workspace-invites", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId: currentWorkspaceId, inviteId }),
      });
      const payload = (await res.json().catch(() => null)) as {
        error?: string;
      } | null;
      if (!res.ok) {
        throw new Error(payload?.error || "Failed to revoke invite");
      }
      showSuccess("Invite revoked");
      await refreshMembersData();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to revoke invite";
      showError(message);
    }
  };

  const pendingInvitesCount = useMemo(
    () =>
      invites.filter(
        (invite) =>
          !invite.accepted_at && !invite.revoked_at && !invite.rejected_at,
      ).length,
    [invites],
  );

  const seatsUsed = members.length + pendingInvitesCount;
  const canManageMembers = workspaceRole === "owner";
  const seatUsageLabel = `${seatsUsed} members`;
  const seatUsageHelp = "Unlimited members on this plan.";

  const peopleRows = useMemo<PersonRow[]>(() => {
    const rows: PersonRow[] = members.map((member) => ({
      id: member.user_id,
      type: "member",
      name: member.name,
      email: member.email,
      isOwner: member.is_owner,
      status: "accepted",
      documentsAccess: member.is_owner
        ? "editor"
        : (member.documents_access ?? "none"),
      dataRoomsAccessAll: member.is_owner
        ? "editor"
        : (member.data_rooms_access_all ?? "none"),
      explicitDataRooms: member.explicit_data_rooms ?? [],
    }));

    invites.forEach((invite) => {
      if (invite.accepted_at || invite.revoked_at) {
        return;
      }
      let status: PersonStatus = "pending";
      if (invite.rejected_at) {
        status = "rejected";
      } else if (
        invite.expires_at &&
        new Date(invite.expires_at).getTime() < Date.now()
      ) {
        status = "expired";
      }
      rows.push({
        id: invite.id,
        type: "invite",
        name: null,
        email: invite.email,
        isOwner: false,
        status,
        invitedAt: invite.invited_at,
        documentsAccess: invite.documents_access ?? "none",
        dataRoomsAccessAll: invite.data_rooms_access_all ?? "none",
        explicitDataRooms: invite.explicit_data_rooms ?? [],
      });
    });

    return rows.sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === "member" ? -1 : 1;
      }
      if (a.type === "invite" && b.type === "invite") {
        const aTime = a.invitedAt ? new Date(a.invitedAt).getTime() : 0;
        const bTime = b.invitedAt ? new Date(b.invitedAt).getTime() : 0;
        return bTime - aTime;
      }
      return (a.name || a.email || "").localeCompare(b.name || b.email || "");
    });
  }, [invites, members]);

  const statusMeta: Record<PersonStatus, { label: string; className: string }> =
    {
      accepted: {
        label: "Accepted",
        className:
          "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300",
      },
      pending: {
        label: "Pending",
        className:
          "bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300",
      },
      revoked: {
        label: "Revoked",
        className: "bg-destructive/10 text-destructive dark:bg-destructive/20",
      },
      rejected: {
        label: "Rejected",
        className:
          "bg-rose-100 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300",
      },
      expired: {
        label: "Expired",
        className:
          "bg-slate-200 text-slate-700 dark:bg-slate-700/60 dark:text-slate-200",
      },
    };

  const formatInviteDetail = (row: PersonRow) => {
    if (row.type !== "invite" || !row.invitedAt) {
      return null;
    }
    try {
      return new Intl.DateTimeFormat(undefined, {
        month: "short",
        day: "numeric",
      }).format(new Date(row.invitedAt));
    } catch {
      return null;
    }
  };

  const memberById = useMemo(() => {
    const map = new Map<string, WorkspaceMemberRow>();
    members.forEach((member) => map.set(member.user_id, member));
    return map;
  }, [members]);

  const openEditAccessDialog = useCallback((member: WorkspaceMemberRow) => {
    setEditingMember(member);
    setEditDocumentsAccess(member.documents_access ?? "none");
    setEditDataRoomsAccessAll(member.data_rooms_access_all ?? "none");
    const roomAccess: Record<string, RoomAccessLevel> = {};
    (member.explicit_data_rooms ?? []).forEach((room) => {
      if (!room?.id) return;
      const level =
        room.access_level === "editor" ? ("editor" as const) : "viewer";
      roomAccess[room.id] = level;
    });
    setEditRoomAccess(roomAccess);
    setEditAccessError(null);
    setEditAccessDialogOpen(true);
  }, []);

  const handleEditAccessDialogOpenChange = useCallback((open: boolean) => {
    setEditAccessDialogOpen(open);
    if (!open) {
      setEditingMember(null);
      setEditDocumentsAccess("none");
      setEditDataRoomsAccessAll("none");
      setEditRoomAccess({});
      setEditAccessError(null);
      setIsEditAccessSubmitting(false);
    }
  }, []);

  const handleRemoveMember = async (targetUserId: string) => {
    if (!currentWorkspaceId) return;
    if (removingMemberId) return;
    setRemovingMemberId(targetUserId);
    try {
      const res = await fetch("/api/settings/workspace-members", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId: currentWorkspaceId,
          userId: targetUserId,
        }),
      });
      const payload = (await res.json().catch(() => null)) as {
        error?: string;
      } | null;
      if (!res.ok) {
        throw new Error(payload?.error || "Failed to remove member");
      }
      showSuccess("Member removed");
      await refreshMembersData();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to remove member";
      showError(message);
    } finally {
      setRemovingMemberId(null);
    }
  };

  const handleEditMemberAccessSubmit = async () => {
    if (!currentWorkspaceId || !editingMember || isEditAccessSubmitting) {
      return;
    }

    if (editingMember.is_owner) {
      setEditAccessError(
        "Workspace owner access is implicit and cannot be edited.",
      );
      return;
    }

    setIsEditAccessSubmitting(true);
    setEditAccessError(null);
    try {
      const editDataRooms = Object.entries(editRoomAccess).map(
        ([dataRoomId, accessLevel]) => ({
          dataRoomId,
          accessLevel,
        }),
      );
      const payload = {
        workspaceId: currentWorkspaceId,
        userId: editingMember.user_id,
        documentsAccess: editDocumentsAccess,
        dataRoomsAccessAll: editDataRoomsAccessAll,
        dataRooms:
          editDataRoomsAccessAll === "none" ? editDataRooms : undefined,
      };
      const res = await fetch("/api/settings/workspace-members", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const responsePayload = (await res.json().catch(() => null)) as {
        error?: string;
      } | null;
      if (!res.ok) {
        throw new Error(responsePayload?.error || "Failed to update access");
      }
      showSuccess("Access updated");
      handleEditAccessDialogOpenChange(false);
      await refreshMembersData();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to update access";
      setEditAccessError(message);
      showError(message);
    } finally {
      setIsEditAccessSubmitting(false);
    }
  };

  const saveProfile = async () => {
    if (!authUser?.id || isSaving || !isDirty) return;
    const normalizedWorkspaceName = sanitizeWorkspaceName(workspaceName).trim();
    if (!normalizedWorkspaceName || normalizedWorkspaceName.length < 3) {
      showError("Workspace name must be at least 3 letters.");
      return;
    }
    setIsSaving(true);
    try {
      const payload: TablesInsert<"profiles"> = {
        id: authUser.id,
        full_name: fullName,
        company,
        job_title: userProfile?.job_title || null,
        industry: userProfile?.industry || null,
      };
      const { data: upserted, error } = await supabase
        .from("profiles")
        .upsert(payload, { onConflict: "id" })
        .select("*")
        .single();
      if (error) throw error;
      setUserProfile(upserted);
      // Also update workspace name to match company/workspace name
      if (currentWorkspaceId && normalizedWorkspaceName) {
        const { error: wsError } = await supabase
          .from("workspaces")
          .update({ name: normalizedWorkspaceName })
          .eq("id", currentWorkspaceId);
        if (wsError) throw wsError;
      }
      setBaseline({
        fullName,
        company,
        workspaceName: normalizedWorkspaceName,
      });
      setWorkspaceName(normalizedWorkspaceName);
      showSuccess("Profile updated");
    } catch (e: unknown) {
      // Supabase errors can carry raw Postgres/RLS text — log them, but keep
      // the toast copy generic.
      console.error("[settings] profile save failed", e);
      showError("Failed to update profile");
    } finally {
      setIsSaving(false);
    }
  };

  const accountDeleteExpectedValue = useMemo(() => {
    const email = authUser?.email?.trim();
    if (email) return email.toLowerCase();
    return "delete";
  }, [authUser?.email]);

  const accountDeletePromptValue = authUser?.email?.trim() || "DELETE";

  const accountDeleteConfirmationMatches = useMemo(() => {
    if (!deleteAccountConfirmation) return false;
    return (
      deleteAccountConfirmation.trim().toLowerCase() ===
      accountDeleteExpectedValue
    );
  }, [accountDeleteExpectedValue, deleteAccountConfirmation]);

  const handleDeleteAccountDialogOpenChange = useCallback((open: boolean) => {
    setDeleteAccountDialogOpen(open);
    if (!open) {
      setDeleteAccountConfirmation("");
    }
  }, []);

  const workspaceDeletePromptValue = useMemo(() => {
    const storeName = workspaces
      .find((ws) => ws.id === currentWorkspaceId)
      ?.name?.trim();
    return storeName || baseline.workspaceName.trim();
  }, [workspaces, currentWorkspaceId, baseline.workspaceName]);

  const workspaceDeleteConfirmationMatches = useMemo(() => {
    if (!deleteWorkspaceConfirmation || !workspaceDeletePromptValue) {
      return false;
    }
    // Server compares case-insensitively after trimming (workspace-delete route).
    return (
      deleteWorkspaceConfirmation.trim().toLowerCase() ===
      workspaceDeletePromptValue.toLowerCase()
    );
  }, [deleteWorkspaceConfirmation, workspaceDeletePromptValue]);

  const handleDeleteWorkspaceDialogOpenChange = useCallback((open: boolean) => {
    setDeleteWorkspaceDialogOpen(open);
    if (!open) {
      setDeleteWorkspaceConfirmation("");
    }
  }, []);

  const handleDeleteWorkspace = async () => {
    if (isDeletingWorkspace || !currentWorkspaceId) return;
    if (!workspaceDeleteConfirmationMatches) {
      showError("Please type the workspace name exactly to confirm deletion.");
      return;
    }

    setIsDeletingWorkspace(true);
    try {
      const res = await fetch("/api/settings/workspace-delete", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId: currentWorkspaceId,
          confirmationName: deleteWorkspaceConfirmation.trim(),
        }),
      });
      const payload = (await res.json().catch(() => null)) as {
        error?: string;
        success?: boolean;
      } | null;

      if (!res.ok) {
        // The route returns curated error strings; safe to surface.
        throw new Error(payload?.error || "Failed to delete workspace");
      }

      const remaining = workspaces.filter((ws) => ws.id !== currentWorkspaceId);
      setWorkspaces(remaining);
      setCurrentWorkspaceId(remaining[0]?.id ?? null);
      setCurrentWorkspaceSubscription(null);

      showSuccess("Workspace deleted");
      handleDeleteWorkspaceDialogOpenChange(false);
      router.replace("/dashboard");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to delete workspace";
      showError(message);
    } finally {
      setIsDeletingWorkspace(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (isDeletingAccount) return;
    if (!accountDeleteConfirmationMatches) {
      showError(
        authUser?.email
          ? "Please type your account email exactly to confirm deletion."
          : "Please type DELETE to confirm account deletion.",
      );
      return;
    }

    setIsDeletingAccount(true);
    try {
      const res = await fetch("/api/settings/account-delete", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          confirmation: deleteAccountConfirmation.trim(),
        }),
      });
      const payload = (await res.json().catch(() => null)) as {
        error?: string;
        success?: boolean;
      } | null;

      if (!res.ok) {
        throw new Error(payload?.error || "Failed to delete account");
      }

      try {
        await supabase.auth.signOut();
      } catch (err) {
        console.warn("[account-delete] sign out failed; continuing", err);
      }

      setWorkspaces([]);
      setCurrentWorkspaceId(null);
      setCurrentWorkspaceSubscription(null);
      setIsUserOnboarded(false);
      setAuthUser(null);
      setIsAuthenticated(false);
      setUserProfile(null);

      showSuccess("Account deleted successfully");
      handleDeleteAccountDialogOpenChange(false);
      router.replace("/");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to delete account";
      showError(message);
    } finally {
      setIsDeletingAccount(false);
    }
  };

  return (
    <SettingsSection
      kicker="Workspace administration"
      title="Workspace & Profile"
      description="Manage your identity, domain, and members."
    >
      <div className="grid gap-4">
        {/* Workspace Identity */}
        <Card className="overflow-hidden bg-card/45 [box-shadow:none]">
          <CardHeader className="border-b border-border/60 pb-4">
            <div className="flex items-center gap-2">
              <span className="flex size-8 items-center justify-center rounded border border-primary/20 bg-primary/[0.06] text-primary">
                <Building2 size={17} aria-hidden="true" />
              </span>
              <CardTitle className="font-medium">Workspace Identity</CardTitle>
            </div>
            <CardDescription>
              Basic information about your workspace and personal profile.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-5">
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="fullName">Full Name</Label>
                <Input
                  id="fullName"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Your full name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="company">Workspace Name (Company)</Label>
                <Input
                  id="company"
                  value={workspaceName}
                  onChange={(e) => {
                    const sanitizedValue = sanitizeWorkspaceName(
                      e.target.value,
                    );
                    setWorkspaceName(sanitizedValue);
                    setCompany(sanitizedValue);
                  }}
                  placeholder="Workspace (company) name"
                  disabled={!canManageMembers}
                />
                <p className="text-xs text-muted-foreground">
                  {workspaceNameError ? (
                    <span className="text-destructive">
                      {workspaceNameError}
                    </span>
                  ) : (
                    "Workspace names may include letters (A-Z) and spaces."
                  )}
                </p>
              </div>
            </div>

            <div className="mt-5 flex justify-end border-t border-border/60 pt-4">
              <Button
                onClick={saveProfile}
                disabled={!isDirty || isSaving || Boolean(workspaceNameError)}
              >
                {isSaving ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="overflow-hidden bg-card/45 [box-shadow:none]">
          <CardHeader className="border-b border-border/60 pb-4">
            <div className="flex items-center gap-2">
              <span className="flex size-8 items-center justify-center rounded border border-primary/20 bg-primary/[0.06] text-primary">
                <Star size={17} aria-hidden="true" />
              </span>
              <CardTitle className="font-medium">Review DocKosha</CardTitle>
            </div>
            <CardDescription>
              Share an honest review on the platform you trust most.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
              Your review helps other teams evaluate DocKosha for secure
              document sharing and data rooms.
            </p>
            <Button
              type="button"
              onClick={() =>
                openReviewModal({
                  reviewSource: "settings_profile",
                  overrides: { tab: "profile" },
                })
              }
            >
              Write a Review
            </Button>
          </CardContent>
        </Card>

        {/* Domain */}
        {canManageMembers ? (
          <Card className="overflow-hidden bg-card/45 [box-shadow:none]">
            <CardHeader className="border-b border-border/60 pb-4">
              <div className="flex items-center gap-2">
                <span className="flex size-8 items-center justify-center rounded border border-primary/20 bg-primary/[0.06] text-primary">
                  <Globe2 size={17} aria-hidden="true" />
                </span>
                <CardTitle className="font-medium">Domain</CardTitle>
              </div>
              <CardDescription>
                Connect your custom domain to brand your shared links.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {customDomainsEnabled ? (
                verifiedDomain ? (
                  <div className="flex items-center gap-2 rounded border border-primary/25 bg-primary/[0.04] p-3">
                    <BadgeCheck
                      className="h-5 w-5 text-emerald-500"
                      aria-hidden
                    />
                    <span className="text-sm font-medium">
                      {verifiedDomain} is verified
                    </span>
                  </div>
                ) : (
                  <div className="flex flex-col gap-3 rounded border border-border/70 bg-background/25 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="space-y-1">
                      <p className="text-sm font-medium">No custom domain</p>
                      <p className="text-sm text-muted-foreground">
                        Use your own domain for a professional look.
                      </p>
                    </div>
                    <Link
                      href="/custom-domain"
                      className={cn(buttonVariants({ variant: "outline" }))}
                    >
                      Configure Domain
                    </Link>
                  </div>
                )
              ) : (
                <div className="flex flex-col gap-3 rounded border border-border/70 bg-background/25 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="space-y-1">
                    <p className="text-sm font-medium">
                      Custom domains require an active subscription
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Upgrade or restart your subscription to enable branded
                      links.
                    </p>
                  </div>
                  <Link
                    href="/settings?tab=subscription&planPicker=1"
                    className={cn(buttonVariants({ variant: "outline" }))}
                  >
                    View plans
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>
        ) : null}

        {/* Role Presets (owner-only) */}
        {canManageMembers ? (
          <Dialog
            open={isRolePresetDialogOpen}
            onOpenChange={handleRolePresetDialogOpenChange}
          >
            <DialogContent className="flex max-h-[85vh] max-w-3xl flex-col overflow-hidden p-0">
              <DialogHeader className="mb-0 border-b px-6 py-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <DialogTitle className="flex items-center gap-2">
                      <Settings2 className="h-5 w-5" aria-hidden="true" />
                      {rolePresetsManagerStep === "list"
                        ? "Role Presets"
                        : editingRolePreset
                          ? "Edit Role Preset"
                          : "New Role Preset"}
                    </DialogTitle>
                    <DialogDescription>
                      {rolePresetsManagerStep === "list"
                        ? "Presets are templates you can apply while inviting or editing a member."
                        : "Presets define base role, Documents access, and Data Room access."}
                    </DialogDescription>
                  </div>

                  {rolePresetsManagerStep === "list" ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-2"
                      onClick={openNewRolePresetDialog}
                    >
                      <Plus className="h-4 w-4" aria-hidden="true" />
                      New preset
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setRolePresetsManagerStep("list");
                        setEditingRolePreset(null);
                        setRolePresetSubmitError(null);
                        setIsRolePresetSubmitting(false);
                      }}
                      disabled={isRolePresetSubmitting}
                    >
                      Back
                    </Button>
                  )}
                </div>
              </DialogHeader>

              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-5">
                {rolePresetsManagerStep === "list" ? (
                  <div className="space-y-4">
                    {isLoadingRolePresets ? (
                      <p className="text-sm text-muted-foreground">Loading…</p>
                    ) : rolePresetsError ? (
                      <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3">
                        <p className="text-sm font-medium">
                          Unable to load presets
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {rolePresetsError}
                        </p>
                      </div>
                    ) : rolePresets.length === 0 ? (
                      <div className="space-y-2">
                        <p className="text-sm text-muted-foreground">
                          No presets yet.
                        </p>
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-2"
                          onClick={openNewRolePresetDialog}
                        >
                          <Plus className="h-4 w-4" aria-hidden="true" />
                          Create your first preset
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="space-y-3 sm:hidden">
                          {rolePresets.map((preset) => {
                            const roomsCount = (preset.rooms ?? []).length;
                            return (
                              <div
                                key={preset.id}
                                className="space-y-2 rounded border border-border/70 bg-card/35 p-3"
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <p className="truncate text-sm font-medium">
                                      {preset.name}
                                    </p>
                                    {preset.description ? (
                                      <p className="line-clamp-2 text-xs text-muted-foreground">
                                        {preset.description}
                                      </p>
                                    ) : null}
                                  </div>
                                  <div className="flex shrink-0 items-center gap-1">
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8"
                                      onClick={() =>
                                        openEditRolePresetDialog(preset)
                                      }
                                    >
                                      <Pencil
                                        className="h-4 w-4"
                                        aria-hidden="true"
                                      />
                                      <span className="sr-only">Edit</span>
                                    </Button>
                                    <AlertDialog>
                                      <AlertDialogTrigger asChild>
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                        >
                                          <Trash2
                                            className="h-4 w-4"
                                            aria-hidden="true"
                                          />
                                          <span className="sr-only">
                                            Delete
                                          </span>
                                        </Button>
                                      </AlertDialogTrigger>
                                      <AlertDialogContent>
                                        <AlertDialogHeader>
                                          <AlertDialogTitle>
                                            Delete this preset?
                                          </AlertDialogTitle>
                                          <AlertDialogDescription>
                                            Members and invites using this
                                            preset won’t be deleted, but their
                                            preset label will be cleared.
                                          </AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter>
                                          <AlertDialogCancel>
                                            Cancel
                                          </AlertDialogCancel>
                                          <AlertDialogAction
                                            variant="destructive"
                                            onClick={() =>
                                              void deleteRolePreset(preset.id)
                                            }
                                          >
                                            Delete preset
                                          </AlertDialogAction>
                                        </AlertDialogFooter>
                                      </AlertDialogContent>
                                    </AlertDialog>
                                  </div>
                                </div>

                                <div className="flex flex-wrap items-center gap-2">
                                  {preset.documents_access === "editor" ? (
                                    <Badge
                                      variant="outline"
                                      className="items-center gap-1.5 border-primary/20 bg-primary/5 px-2 py-0.5 font-medium text-primary"
                                    >
                                      <FileText
                                        className="h-3.5 w-3.5"
                                        aria-hidden="true"
                                      />
                                      Editor
                                    </Badge>
                                  ) : preset.documents_access === "viewer" ? (
                                    <Badge
                                      variant="outline"
                                      className="items-center gap-1.5 px-2 py-0.5 font-medium text-muted-foreground"
                                    >
                                      <Eye
                                        className="h-3.5 w-3.5"
                                        aria-hidden="true"
                                      />
                                      Viewer
                                    </Badge>
                                  ) : (
                                    <Badge
                                      variant="outline"
                                      className="px-2 py-0.5 font-medium text-muted-foreground"
                                    >
                                      Docs: None
                                    </Badge>
                                  )}

                                  {preset.data_rooms_access_all === "editor" ? (
                                    <Badge
                                      variant="outline"
                                      className="items-center gap-1.5 border-primary/20 bg-primary/5 px-2 py-0.5 font-medium text-primary"
                                    >
                                      <ShieldCheck
                                        className="h-3.5 w-3.5"
                                        aria-hidden="true"
                                      />
                                      All Data Rooms
                                    </Badge>
                                  ) : preset.data_rooms_access_all ===
                                    "viewer" ? (
                                    <Badge
                                      variant="outline"
                                      className="items-center gap-1.5 px-2 py-0.5 font-medium text-muted-foreground"
                                    >
                                      <Eye
                                        className="h-3.5 w-3.5"
                                        aria-hidden="true"
                                      />
                                      All Data Rooms
                                    </Badge>
                                  ) : roomsCount > 0 ? (
                                    <Badge
                                      variant="outline"
                                      className="items-center gap-1.5 px-2 py-0.5 font-medium"
                                    >
                                      <Folder
                                        className="h-3.5 w-3.5"
                                        aria-hidden="true"
                                      />
                                      {roomsCount} Room
                                      {roomsCount === 1 ? "" : "s"}
                                    </Badge>
                                  ) : (
                                    <Badge
                                      variant="outline"
                                      className="px-2 py-0.5 font-medium text-muted-foreground"
                                    >
                                      Data Rooms: None
                                    </Badge>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        <div className="hidden rounded-md border sm:block">
                          <Table className="table-fixed">
                            <TableHeader>
                              <TableRow className="bg-muted/50 hover:bg-muted/50">
                                <TableHead className="w-[40%]">Name</TableHead>
                                <TableHead className="w-[140px]">
                                  Docs
                                </TableHead>
                                <TableHead className="w-[220px]">
                                  Data Rooms
                                </TableHead>
                                <TableHead className="w-[96px] text-right">
                                  Actions
                                </TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {rolePresets.map((preset) => {
                                const roomsCount = (preset.rooms ?? []).length;
                                return (
                                  <TableRow key={preset.id} className="group">
                                    <TableCell className="font-medium">
                                      <div className="min-w-0 space-y-1">
                                        <p className="truncate font-medium">
                                          {preset.name}
                                        </p>
                                        {preset.description && (
                                          <p className="line-clamp-1 text-xs font-normal text-muted-foreground">
                                            {preset.description}
                                          </p>
                                        )}
                                      </div>
                                    </TableCell>
                                    <TableCell>
                                      {preset.documents_access === "editor" ? (
                                        <Badge
                                          variant="outline"
                                          className="items-center gap-1.5 border-primary/20 bg-primary/5 px-2 py-0.5 font-medium text-primary"
                                        >
                                          <FileText
                                            className="h-3.5 w-3.5"
                                            aria-hidden="true"
                                          />
                                          Editor
                                        </Badge>
                                      ) : preset.documents_access ===
                                        "viewer" ? (
                                        <Badge
                                          variant="outline"
                                          className="items-center gap-1.5 px-2 py-0.5 font-medium text-muted-foreground"
                                        >
                                          <Eye
                                            className="h-3.5 w-3.5"
                                            aria-hidden="true"
                                          />
                                          Viewer
                                        </Badge>
                                      ) : (
                                        <span className="text-sm text-muted-foreground">
                                          None
                                        </span>
                                      )}
                                    </TableCell>
                                    <TableCell>
                                      {preset.data_rooms_access_all ===
                                      "editor" ? (
                                        <Badge
                                          variant="outline"
                                          className="items-center gap-1.5 border-primary/20 bg-primary/5 px-2 py-0.5 font-medium text-primary"
                                        >
                                          <ShieldCheck
                                            className="h-3.5 w-3.5"
                                            aria-hidden="true"
                                          />
                                          All Data Rooms
                                        </Badge>
                                      ) : preset.data_rooms_access_all ===
                                        "viewer" ? (
                                        <Badge
                                          variant="outline"
                                          className="items-center gap-1.5 px-2 py-0.5 font-medium text-muted-foreground"
                                        >
                                          <Eye
                                            className="h-3.5 w-3.5"
                                            aria-hidden="true"
                                          />
                                          All Data Rooms
                                        </Badge>
                                      ) : roomsCount > 0 ? (
                                        <Badge
                                          variant="outline"
                                          className="items-center gap-1.5 px-2 py-0.5 font-medium"
                                        >
                                          <Folder
                                            className="h-3.5 w-3.5"
                                            aria-hidden="true"
                                          />
                                          {roomsCount} Room
                                          {roomsCount === 1 ? "" : "s"}
                                        </Badge>
                                      ) : (
                                        <span className="text-sm text-muted-foreground">
                                          None
                                        </span>
                                      )}
                                    </TableCell>
                                    <TableCell className="text-right">
                                      <div className="flex items-center justify-end gap-2 sm:opacity-0 sm:transition-opacity sm:group-focus-within:opacity-100 sm:group-hover:opacity-100">
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="h-8 w-8"
                                          onClick={() =>
                                            openEditRolePresetDialog(preset)
                                          }
                                        >
                                          <Pencil
                                            className="h-4 w-4"
                                            aria-hidden="true"
                                          />
                                          <span className="sr-only">Edit</span>
                                        </Button>
                                        <AlertDialog>
                                          <AlertDialogTrigger asChild>
                                            <Button
                                              variant="ghost"
                                              size="icon"
                                              className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                            >
                                              <Trash2
                                                className="h-4 w-4"
                                                aria-hidden="true"
                                              />
                                              <span className="sr-only">
                                                Delete
                                              </span>
                                            </Button>
                                          </AlertDialogTrigger>
                                          <AlertDialogContent>
                                            <AlertDialogHeader>
                                              <AlertDialogTitle>
                                                Delete this preset?
                                              </AlertDialogTitle>
                                              <AlertDialogDescription>
                                                Members and invites using this
                                                preset won’t be deleted, but
                                                their preset label will be
                                                cleared.
                                              </AlertDialogDescription>
                                            </AlertDialogHeader>
                                            <AlertDialogFooter>
                                              <AlertDialogCancel>
                                                Cancel
                                              </AlertDialogCancel>
                                              <AlertDialogAction
                                                variant="destructive"
                                                onClick={() =>
                                                  void deleteRolePreset(
                                                    preset.id,
                                                  )
                                                }
                                              >
                                                Delete preset
                                              </AlertDialogAction>
                                            </AlertDialogFooter>
                                          </AlertDialogContent>
                                        </AlertDialog>
                                      </div>
                                    </TableCell>
                                  </TableRow>
                                );
                              })}
                            </TableBody>
                          </Table>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="preset-name">Name</Label>
                      <Input
                        id="preset-name"
                        value={rolePresetName}
                        onChange={(e) => setRolePresetName(e.target.value)}
                        placeholder="e.g. Finance DR Viewer"
                        disabled={isRolePresetSubmitting}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="preset-description">Description</Label>
                      <Textarea
                        id="preset-description"
                        value={rolePresetDescription}
                        onChange={(e) =>
                          setRolePresetDescription(e.target.value)
                        }
                        placeholder="Optional…"
                        disabled={isRolePresetSubmitting}
                      />
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Workspace documents access</Label>
                        <Select
                          value={rolePresetDocumentsAccess}
                          onValueChange={(v) =>
                            setRolePresetDocumentsAccess(v as AccessLevel)
                          }
                          disabled={isRolePresetSubmitting}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select access" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">None</SelectItem>
                            <SelectItem value="viewer">Viewer</SelectItem>
                            <SelectItem value="editor">Editor</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label>Data rooms access</Label>
                        <Select
                          value={rolePresetDataRoomsAccessAll}
                          onValueChange={(v) => {
                            const next = v as AccessLevel;
                            setRolePresetDataRoomsAccessAll(next);
                            if (next !== "none") setRolePresetRoomAccess({});
                          }}
                          disabled={isRolePresetSubmitting}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select data rooms access" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Custom</SelectItem>
                            <SelectItem value="viewer">
                              Viewer for all data rooms
                            </SelectItem>
                            <SelectItem value="editor">
                              Editor for all data rooms
                            </SelectItem>
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">
                          If you select “Custom”, you can assign specific rooms
                          below.
                        </p>
                      </div>
                    </div>

                    {rolePresetDataRoomsAccessAll === "none" && (
                      <div className="space-y-2 pt-2">
                        <div className="space-y-1">
                          <Label>Data room assignments</Label>
                          <p className="text-xs text-muted-foreground">
                            Choose which data rooms this preset grants access
                            to.
                          </p>
                        </div>
                        <div className="max-h-56 space-y-2 overflow-y-auto rounded-md border p-2">
                          {isLoadingDataRooms ? (
                            <p className="text-sm text-muted-foreground">
                              Loading data rooms…
                            </p>
                          ) : workspaceDataRooms.length > 0 ? (
                            workspaceDataRooms.map((room) => {
                              const level = rolePresetRoomAccess[room.id];
                              const checked = Boolean(level);
                              return (
                                <div
                                  key={room.id}
                                  className="flex flex-col gap-2 rounded-md border p-2 sm:flex-row sm:items-center sm:justify-between"
                                >
                                  <label className="flex min-w-0 cursor-pointer items-start gap-3">
                                    <Checkbox
                                      checked={checked}
                                      onCheckedChange={(v) => {
                                        const next = Boolean(v);
                                        setRolePresetRoomAccess((prev) => {
                                          const copy = { ...prev };
                                          if (next) {
                                            copy[room.id] =
                                              copy[room.id] ?? "viewer";
                                          } else {
                                            delete copy[room.id];
                                          }
                                          return copy;
                                        });
                                      }}
                                      disabled={isRolePresetSubmitting}
                                      aria-label={`Assign ${room.name || "data room"}`}
                                    />
                                    <span className="min-w-0">
                                      <span className="block truncate text-sm font-medium">
                                        {room.name || "Untitled data room"}
                                      </span>
                                    </span>
                                  </label>

                                  {checked ? (
                                    <div className="flex items-center gap-2 sm:justify-end">
                                      <Select
                                        value={level}
                                        onValueChange={(v) => {
                                          const next = v as RoomAccessLevel;
                                          setRolePresetRoomAccess((prev) => ({
                                            ...prev,
                                            [room.id]: next,
                                          }));
                                        }}
                                        disabled={isRolePresetSubmitting}
                                      >
                                        <SelectTrigger className="w-[160px]">
                                          <SelectValue placeholder="Access level" />
                                        </SelectTrigger>
                                        <SelectContent>
                                          <SelectItem value="viewer">
                                            Viewer
                                          </SelectItem>
                                          <SelectItem value="editor">
                                            Editor
                                          </SelectItem>
                                        </SelectContent>
                                      </Select>
                                    </div>
                                  ) : null}
                                </div>
                              );
                            })
                          ) : (
                            <div className="space-y-2 p-1">
                              <p className="text-sm text-muted-foreground">
                                No data rooms yet.
                              </p>
                              <Link
                                href="/data-rooms"
                                className={cn(
                                  buttonVariants({
                                    variant: "link",
                                    size: "sm",
                                  }),
                                  "h-auto px-0 py-0",
                                )}
                              >
                                Create a data room
                              </Link>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {rolePresetsManagerStep !== "list" ? (
                <DialogFooter className="mt-0 w-full items-center justify-between gap-3 border-t border-border/60 bg-muted/[0.12] px-6 py-4">
                  <div className="min-w-0 flex-1">
                    {rolePresetSubmitError ? (
                      <p className="text-sm wrap-break-word text-destructive">
                        {rolePresetSubmitError}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={isRolePresetSubmitting}
                      onClick={() => {
                        setRolePresetsManagerStep("list");
                        setEditingRolePreset(null);
                        setRolePresetSubmitError(null);
                        setIsRolePresetSubmitting(false);
                      }}
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={saveRolePreset}
                      disabled={isRolePresetSubmitting}
                    >
                      {isRolePresetSubmitting ? "Saving…" : "Save preset"}
                    </Button>
                  </div>
                </DialogFooter>
              ) : null}
            </DialogContent>
          </Dialog>
        ) : null}

        {/* Members (owner-only) */}
        {canManageMembers ? (
          <Card className="overflow-hidden bg-card/45 [box-shadow:none]">
            <CardHeader className="border-b border-border/60 pb-4">
              <div className="flex items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Users className="h-5 w-5 text-primary" aria-hidden />
                    <CardTitle className="font-medium">Members</CardTitle>
                  </div>
                  <CardDescription>
                    Manage who has access to your workspace.
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={openRolePresetsManager}
                  >
                    Edit role presets
                  </Button>
                  <Dialog
                    open={isInviteDialogOpen}
                    onOpenChange={handleInviteDialogOpenChange}
                  >
                    <DialogTrigger asChild>
                      <Button variant="outline" size="sm">
                        Add member
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-h-[85vh] w-[92vw] max-w-2xl gap-6 overflow-y-auto overscroll-contain">
                      <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                          <UserPlus className="h-5 w-5" aria-hidden />
                          Invite a member
                        </DialogTitle>
                        <DialogDescription>
                          Send an email invitation to add someone to this
                          workspace.
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <Label htmlFor="invite-email">Email address</Label>
                          <Input
                            id="invite-email"
                            type="email"
                            value={inviteEmail}
                            onChange={(e) => setInviteEmail(e.target.value)}
                            placeholder="teammate@example.com"
                          />
                          {inviteEmailTrimmed && !isInviteEmailValid ? (
                            <p className="text-sm text-destructive">
                              Enter a valid email address.
                            </p>
                          ) : null}
                        </div>
                        <WorkspaceMemberAccessFields
                          idPrefix="invite"
                          disabled={isInviteSubmitting}
                          rolePresets={rolePresets}
                          workspaceDataRooms={workspaceDataRooms}
                          documentsAccess={inviteDocumentsAccess}
                          onDocumentsAccessChange={(next) =>
                            setInviteDocumentsAccess(next as AccessLevel)
                          }
                          dataRoomsAccessAll={inviteDataRoomsAccessAll}
                          onDataRoomsAccessAllChange={(next) =>
                            setInviteDataRoomsAccessAll(next as AccessLevel)
                          }
                          roomAccess={inviteRoomAccess}
                          onRoomAccessChange={(next) =>
                            setInviteRoomAccess(
                              next as Record<string, RoomAccessLevel>,
                            )
                          }
                        />

                        {inviteError ? (
                          <p className="text-sm text-destructive">
                            {inviteError}
                          </p>
                        ) : null}
                      </div>
                      <DialogFooter className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
                        <DialogClose asChild>
                          <Button variant="ghost">Cancel</Button>
                        </DialogClose>
                        <Button
                          onClick={handleInviteSubmit}
                          disabled={
                            isInviteSubmitting ||
                            !inviteEmailTrimmed ||
                            !isInviteEmailValid
                          }
                        >
                          {isInviteSubmitting ? "Sending..." : "Send invite"}
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-1 text-sm sm:flex-row sm:items-baseline sm:justify-between">
                <p className="font-medium">{seatUsageLabel}</p>
                <p className="text-xs text-muted-foreground">{seatUsageHelp}</p>
              </div>
              <div className="text-xs text-muted-foreground">
                {pendingInvitesCount > 0
                  ? `${pendingInvitesCount} pending invite${
                      pendingInvitesCount === 1 ? "" : "s"
                    }.`
                  : "No pending invites."}
              </div>
              <div className="mt-4 rounded-md border">
                <div className="divide-y">
                  {peopleRows.length ? (
                    peopleRows.map((row) => {
                      const status = statusMeta[row.status];
                      const subtitle =
                        row.email ||
                        (row.type === "invite" ? "Pending invite" : "—");
                      const invitedDetail = formatInviteDetail(row);
                      const isSelf =
                        row.type === "member" && row.id === authUser?.id;
                      const isOwnerRole = row.isOwner;
                      const isRowBusy = removingMemberId === row.id;
                      const initials = (row.name || row.email || "—")
                        .split(" ")
                        .map((part) => part[0])
                        .filter(Boolean)
                        .slice(0, 2)
                        .join("")
                        .toUpperCase();
                      return (
                        <div
                          key={`${row.type}-${row.id}`}
                          className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between"
                        >
                          <div className="flex items-center gap-4">
                            <Avatar className="h-10 w-10 border">
                              <AvatarFallback className="text-sm">
                                {initials || "--"}
                              </AvatarFallback>
                            </Avatar>
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <p className="text-sm leading-none font-medium">
                                  {row.name ||
                                    (row.type === "invite"
                                      ? row.status === "rejected"
                                        ? "Invitation declined"
                                        : row.status === "expired"
                                          ? "Invitation expired"
                                          : "Invitation pending"
                                      : "—")}
                                </p>
                                {row.isOwner && (
                                  <Badge
                                    variant="secondary"
                                    className="h-5 px-1.5 text-[10px]"
                                  >
                                    Owner
                                  </Badge>
                                )}
                                {row.type === "invite" && (
                                  <Badge
                                    data-testid="workspace-invite-status"
                                    data-invite-id={row.id}
                                    className={cn(
                                      "h-5 px-1.5 text-[10px]",
                                      status.className,
                                    )}
                                  >
                                    {status.label}
                                  </Badge>
                                )}
                              </div>
                              <p className="text-sm text-muted-foreground">
                                {subtitle}
                              </p>
                              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground/80">
                                <span>Docs: {row.documentsAccess}</span>
                                <span className="text-border">|</span>
                                <span>
                                  {row.dataRoomsAccessAll === "none"
                                    ? `Data rooms: Custom (${row.explicitDataRooms.length})`
                                    : `Data rooms: All (${row.dataRoomsAccessAll})`}
                                </span>
                                {invitedDetail && (
                                  <>
                                    <span className="text-border">|</span>
                                    <span>Invited {invitedDetail}</span>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 pl-14 sm:pl-0">
                            {row.type === "invite" &&
                            row.status === "pending" ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 px-2 text-destructive hover:text-destructive"
                                onClick={() => handleRevokeInvite(row.id)}
                              >
                                <XCircle
                                  className="mr-1.5 h-3.5 w-3.5"
                                  aria-hidden
                                />
                                Revoke
                              </Button>
                            ) : null}
                            {row.type === "member" ? (
                              <>
                                {!row.isOwner ? (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-8"
                                    disabled={isRowBusy}
                                    onClick={() => {
                                      const member = memberById.get(row.id);
                                      if (!member) return;
                                      openEditAccessDialog(member);
                                    }}
                                  >
                                    Edit access
                                  </Button>
                                ) : null}
                                {!row.isOwner ? (
                                  <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                        disabled={
                                          isRowBusy || isSelf || isOwnerRole
                                        }
                                        title={
                                          isSelf
                                            ? "You can't remove yourself."
                                            : isOwnerRole
                                              ? "You can't remove the workspace owner."
                                              : undefined
                                        }
                                      >
                                        <UserMinus
                                          className="h-4 w-4"
                                          aria-hidden
                                        />
                                        <span className="sr-only">Remove</span>
                                      </Button>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent>
                                      <AlertDialogHeader>
                                        <AlertDialogTitle>
                                          Remove member?
                                        </AlertDialogTitle>
                                        <AlertDialogDescription>
                                          This will remove{" "}
                                          <span className="font-medium">
                                            {row.email ??
                                              row.name ??
                                              "this user"}
                                          </span>{" "}
                                          from your workspace.
                                        </AlertDialogDescription>
                                      </AlertDialogHeader>
                                      <AlertDialogFooter>
                                        <AlertDialogCancel>
                                          Cancel
                                        </AlertDialogCancel>
                                        <AlertDialogAction
                                          variant="destructive"
                                          onClick={() =>
                                            void handleRemoveMember(row.id)
                                          }
                                          disabled={
                                            isRowBusy || isSelf || isOwnerRole
                                          }
                                        >
                                          {removingMemberId === row.id
                                            ? "Removing..."
                                            : "Remove"}
                                        </AlertDialogAction>
                                      </AlertDialogFooter>
                                    </AlertDialogContent>
                                  </AlertDialog>
                                ) : null}
                              </>
                            ) : null}
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="p-4 text-center text-sm text-muted-foreground">
                      No members or invites yet.
                    </div>
                  )}
                </div>
              </div>
              <Dialog
                open={isEditAccessDialogOpen}
                onOpenChange={handleEditAccessDialogOpenChange}
              >
                <DialogContent className="max-h-[85vh] w-[92vw] max-w-2xl overflow-y-auto overscroll-contain">
                  <DialogHeader>
                    <DialogTitle>Edit member access</DialogTitle>
                    <DialogDescription>
                      Update document and data room access for this workspace
                      member.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="rounded border border-border/70 bg-background/25 p-4">
                      <div className="flex items-center gap-3">
                        <Avatar className="h-10 w-10 border">
                          <AvatarFallback className="text-sm">
                            {(
                              editingMember?.name ||
                              editingMember?.email ||
                              "?"
                            )
                              .slice(0, 2)
                              .toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className="space-y-0.5">
                          <p className="text-sm font-medium">
                            {editingMember?.name || "Workspace member"}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {editingMember?.email || "No email available"}
                          </p>
                        </div>
                      </div>
                    </div>

                    {editingMember?.is_owner ? (
                      <div className="flex items-start gap-3 rounded-md border border-border/50 bg-muted/30 p-3">
                        <ShieldCheck
                          className="mt-0.5 h-4 w-4 shrink-0 text-primary"
                          aria-hidden
                        />
                        <div className="space-y-1">
                          <p className="text-sm font-medium">
                            Owner Access Granted
                          </p>
                          <p className="text-xs leading-relaxed text-muted-foreground">
                            Owners always have full access to documents and all
                            data rooms. To change an owner, update their
                            workspace role.
                          </p>
                        </div>
                      </div>
                    ) : (
                      <>
                        <WorkspaceMemberAccessFields
                          idPrefix="edit"
                          disabled={isEditAccessSubmitting}
                          rolePresets={rolePresets}
                          workspaceDataRooms={workspaceDataRooms}
                          documentsAccess={editDocumentsAccess}
                          onDocumentsAccessChange={(next) =>
                            setEditDocumentsAccess(next as AccessLevel)
                          }
                          dataRoomsAccessAll={editDataRoomsAccessAll}
                          onDataRoomsAccessAllChange={(next) =>
                            setEditDataRoomsAccessAll(next as AccessLevel)
                          }
                          roomAccess={editRoomAccess}
                          onRoomAccessChange={(next) =>
                            setEditRoomAccess(
                              next as Record<string, RoomAccessLevel>,
                            )
                          }
                        />
                      </>
                    )}

                    {editAccessError ? (
                      <p className="text-sm text-destructive">
                        {editAccessError}
                      </p>
                    ) : null}
                  </div>
                  <DialogFooter className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
                    <DialogClose asChild>
                      <Button variant="ghost">Cancel</Button>
                    </DialogClose>
                    <Button
                      onClick={handleEditMemberAccessSubmit}
                      disabled={
                        isEditAccessSubmitting ||
                        !editingMember ||
                        editingMember.is_owner
                      }
                    >
                      {isEditAccessSubmitting ? "Saving..." : "Save access"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </CardContent>
          </Card>
        ) : null}

        {/* Data Rights */}
        <Card className="overflow-hidden bg-card/45 [box-shadow:none]">
          <CardHeader className="border-b border-border/60 pb-4">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5 text-primary" aria-hidden />
                  <CardTitle className="font-medium">Data Rights</CardTitle>
                </div>
                <CardDescription>
                  Manage your data privacy and export rights.
                </CardDescription>
              </div>
              <Link
                href="/data-request"
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                Start Request
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Review, export, correct, or delete your data at any time. All
              requests are securely routed to our privacy team.
            </p>
          </CardContent>
        </Card>

        <Card className="overflow-hidden border-destructive/45 bg-destructive/[0.015] [box-shadow:none]">
          <CardHeader className="border-b border-destructive/20 pb-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" aria-hidden />
              <CardTitle className="text-destructive">Danger Zone</CardTitle>
            </div>
            <CardDescription>
              Irreversible actions that affect your workspace and account.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {workspaceRole === "owner" && currentWorkspaceId ? (
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1">
                  <p className="text-sm font-medium">Delete this workspace</p>
                  <p className="text-sm text-muted-foreground">
                    Permanently deletes{" "}
                    <span className="font-medium">
                      {workspaceDeletePromptValue || "this workspace"}
                    </span>{" "}
                    with all of its documents, data rooms, links, and analytics.
                    Your account and other workspaces are not affected.
                  </p>
                </div>
                <Dialog
                  open={isDeleteWorkspaceDialogOpen}
                  onOpenChange={handleDeleteWorkspaceDialogOpenChange}
                >
                  <DialogTrigger asChild>
                    <Button
                      variant="destructive"
                      size="sm"
                      className="shrink-0"
                    >
                      <Trash2 className="mr-2 h-4 w-4" aria-hidden />
                      Delete Workspace
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle className="flex items-center gap-2 text-destructive">
                        <AlertTriangle className="h-5 w-5" aria-hidden />
                        Delete Workspace
                      </DialogTitle>
                      <DialogDescription asChild>
                        <div>
                          <p>
                            This action is permanent and cannot be undone.
                            Deleting this workspace will:
                          </p>
                          <ul className="mt-2 ml-4 list-disc space-y-1 text-sm text-muted-foreground">
                            <li>
                              Delete all documents, data rooms, and stored files
                            </li>
                            <li>
                              Disable all share links and delete their analytics
                            </li>
                            <li>Remove all workspace members and invites</li>
                          </ul>
                        </div>
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-2 pt-2">
                      <Label htmlFor="delete-workspace-confirmation">
                        Type{" "}
                        <span className="font-semibold">
                          {workspaceDeletePromptValue}
                        </span>{" "}
                        to confirm:
                      </Label>
                      <Input
                        id="delete-workspace-confirmation"
                        value={deleteWorkspaceConfirmation}
                        onChange={(e) =>
                          setDeleteWorkspaceConfirmation(e.target.value)
                        }
                        placeholder={workspaceDeletePromptValue}
                        disabled={isDeletingWorkspace}
                        autoComplete="off"
                      />
                    </div>
                    <DialogFooter className="gap-2">
                      <DialogClose asChild>
                        <Button
                          variant="outline"
                          disabled={isDeletingWorkspace}
                        >
                          Cancel
                        </Button>
                      </DialogClose>
                      <Button
                        variant="destructive"
                        onClick={handleDeleteWorkspace}
                        disabled={
                          !workspaceDeleteConfirmationMatches ||
                          isDeletingWorkspace
                        }
                      >
                        {isDeletingWorkspace
                          ? "Deleting..."
                          : "Delete Workspace"}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            ) : null}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1">
                <p className="text-sm font-medium">Delete this account</p>
                <p className="text-sm text-muted-foreground">
                  This permanently deletes your authentication account and
                  profile. Any workspaces you own (and all their data) will also
                  be deleted. Workspaces you don’t own will remain.
                </p>
              </div>
              <Dialog
                open={isDeleteAccountDialogOpen}
                onOpenChange={handleDeleteAccountDialogOpenChange}
              >
                <DialogTrigger asChild>
                  <Button variant="destructive" size="sm" className="shrink-0">
                    <Trash2 className="mr-2 h-4 w-4" aria-hidden />
                    Delete Account
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-destructive">
                      <AlertTriangle className="h-5 w-5" aria-hidden />
                      Delete Account
                    </DialogTitle>
                    <DialogDescription asChild>
                      <div>
                        <p>
                          This action is permanent and cannot be undone.
                          Deleting your account will:
                        </p>
                        <ul className="mt-2 ml-4 list-disc space-y-1 text-sm text-muted-foreground">
                          <li>
                            Delete your authentication account and profile
                          </li>
                          <li>Remove your memberships and invites</li>
                          <li>
                            Delete all workspaces you own and related files
                          </li>
                        </ul>
                      </div>
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-2 pt-2">
                    <Label htmlFor="delete-account-confirmation">
                      Type{" "}
                      <span className="font-semibold">
                        {accountDeletePromptValue}
                      </span>{" "}
                      to confirm:
                    </Label>
                    <Input
                      id="delete-account-confirmation"
                      value={deleteAccountConfirmation}
                      onChange={(e) =>
                        setDeleteAccountConfirmation(e.target.value)
                      }
                      placeholder={accountDeletePromptValue}
                      disabled={isDeletingAccount}
                      autoComplete="off"
                    />
                  </div>
                  <DialogFooter className="gap-2">
                    <DialogClose asChild>
                      <Button variant="outline" disabled={isDeletingAccount}>
                        Cancel
                      </Button>
                    </DialogClose>
                    <Button
                      variant="destructive"
                      onClick={handleDeleteAccount}
                      disabled={
                        !accountDeleteConfirmationMatches || isDeletingAccount
                      }
                    >
                      {isDeletingAccount ? "Deleting..." : "Delete Account"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </CardContent>
        </Card>
      </div>
    </SettingsSection>
  );
};

export default ProfileSettings;
