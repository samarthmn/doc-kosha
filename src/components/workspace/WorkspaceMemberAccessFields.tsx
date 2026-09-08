"use client";

import React, { useEffect, useMemo } from "react";
import { CaretDown, Key, LockKey } from "@phosphor-icons/react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type AccessLevel = "none" | "viewer" | "editor";
export type RoomAccessLevel = "viewer" | "editor";

export type WorkspaceRolePreset = {
  id: string;
  name: string;
  documents_access: AccessLevel;
  data_rooms_access_all: AccessLevel;
  rooms?: Array<{ dataRoomId: string; accessLevel: RoomAccessLevel }>;
};

export type WorkspaceDataRoomOption = {
  id: string;
  name: string | null;
};

type Props = {
  idPrefix: string;
  disabled?: boolean;

  rolePresets: WorkspaceRolePreset[];
  workspaceDataRooms: WorkspaceDataRoomOption[];

  documentsAccess: AccessLevel;
  onDocumentsAccessChange: (next: AccessLevel) => void;

  dataRoomsAccessAll: AccessLevel;
  onDataRoomsAccessAllChange: (next: AccessLevel) => void;

  roomAccess: Record<string, RoomAccessLevel>;
  onRoomAccessChange: (next: Record<string, RoomAccessLevel>) => void;

  lockedDataRoomId?: string;
  lockedDataRoomDefaultLevel?: RoomAccessLevel;
  disablePresetsMissingLockedRoom?: boolean;
};

export const WorkspaceMemberAccessFields: React.FC<Props> = ({
  idPrefix,
  disabled = false,
  rolePresets,
  workspaceDataRooms,
  documentsAccess,
  onDocumentsAccessChange,
  dataRoomsAccessAll,
  onDataRoomsAccessAllChange,
  roomAccess,
  onRoomAccessChange,
  lockedDataRoomId,
  lockedDataRoomDefaultLevel = "viewer",
  disablePresetsMissingLockedRoom = false,
}) => {
  const lockedRoomLabel = useMemo(() => {
    if (!lockedDataRoomId) return null;
    const room = workspaceDataRooms.find((r) => r.id === lockedDataRoomId);
    return room?.name || "this data room";
  }, [lockedDataRoomId, workspaceDataRooms]);

  useEffect(() => {
    if (!lockedDataRoomId) return;
    if (roomAccess[lockedDataRoomId]) return;
    onRoomAccessChange({
      ...roomAccess,
      [lockedDataRoomId]: lockedDataRoomDefaultLevel,
    });
  }, [
    lockedDataRoomDefaultLevel,
    lockedDataRoomId,
    onRoomAccessChange,
    roomAccess,
  ]);

  const clearRoomsForAllRoomsAccess = (nextAllRooms: AccessLevel) => {
    if (nextAllRooms === "none") return;
    const next: Record<string, RoomAccessLevel> = {};
    if (lockedDataRoomId) {
      next[lockedDataRoomId] = lockedDataRoomDefaultLevel;
    }
    onRoomAccessChange(next);
  };

  const applyPreset = (preset: WorkspaceRolePreset) => {
    onDocumentsAccessChange(preset.documents_access ?? "none");
    onDataRoomsAccessAllChange(preset.data_rooms_access_all ?? "none");

    if ((preset.data_rooms_access_all ?? "none") !== "none") {
      const next: Record<string, RoomAccessLevel> = {};
      if (lockedDataRoomId) {
        next[lockedDataRoomId] = lockedDataRoomDefaultLevel;
      }
      onRoomAccessChange(next);
      return;
    }

    const next: Record<string, RoomAccessLevel> = {};
    (preset.rooms ?? []).forEach((r) => {
      next[r.dataRoomId] = r.accessLevel;
    });

    if (lockedDataRoomId && !next[lockedDataRoomId]) {
      next[lockedDataRoomId] = lockedDataRoomDefaultLevel;
    }

    onRoomAccessChange(next);
  };

  return (
    <div className="space-y-4 rounded-lg border border-border/70 bg-card/35 p-3 sm:p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex size-8 shrink-0 items-center justify-center rounded border border-primary/20 bg-primary/[0.06] text-primary">
            {lockedDataRoomId ? (
              <LockKey size={16} aria-hidden="true" />
            ) : (
              <Key size={16} aria-hidden="true" />
            )}
          </span>
          <div className="space-y-0.5">
            <p className="text-sm font-medium">Access</p>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Choose document + data room permissions. Use “Apply preset” to
              prefill.
            </p>
            {lockedDataRoomId ? (
              <p className="text-xs text-muted-foreground">
                {lockedRoomLabel
                  ? `Includes access to ${lockedRoomLabel}.`
                  : "Includes access to this data room."}
              </p>
            ) : null}
          </div>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="ghost" size="sm" disabled={disabled}>
              Apply preset
              <CaretDown size={14} className="ml-1" aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {rolePresets.length > 0 ? (
              rolePresets.map((preset) => {
                const requiresLocked =
                  Boolean(lockedDataRoomId) && disablePresetsMissingLockedRoom;
                const presetIncludesLocked =
                  !lockedDataRoomId ||
                  (preset.data_rooms_access_all ?? "none") !== "none" ||
                  Boolean(
                    (preset.rooms ?? []).some(
                      (r) => r.dataRoomId === lockedDataRoomId,
                    ),
                  );
                const isDisabled =
                  disabled || (requiresLocked && !presetIncludesLocked);

                return (
                  <DropdownMenuItem
                    key={preset.id}
                    disabled={isDisabled}
                    title={
                      requiresLocked && !presetIncludesLocked
                        ? "This preset does not include access to the current data room."
                        : undefined
                    }
                    onSelect={() => applyPreset(preset)}
                  >
                    {preset.name}
                  </DropdownMenuItem>
                );
              })
            ) : (
              <DropdownMenuItem disabled>No presets available</DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <p className="text-xs text-muted-foreground">
        Selecting a preset overwrites the access settings below.
      </p>

      <div className="space-y-1 rounded border border-border/60 bg-muted/[0.14] p-3">
        <p className="text-sm font-medium">What these mean</p>
        <ul className="list-disc space-y-1 pl-4 text-xs text-muted-foreground">
          <li>
            <span className="font-medium text-foreground/90">
              Workspace documents
            </span>
            : documents outside data rooms.
          </li>
          <li>
            <span className="font-medium text-foreground/90">Data rooms</span>:
            separate access for data rooms and everything inside them.
          </li>
        </ul>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-documents-access`}>
            Workspace documents access
          </Label>
          <Select
            value={documentsAccess}
            onValueChange={(value) =>
              onDocumentsAccessChange(value as AccessLevel)
            }
            disabled={disabled}
          >
            <SelectTrigger id={`${idPrefix}-documents-access`}>
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
          <Label htmlFor={`${idPrefix}-data-rooms-access-all`}>
            Data rooms access
          </Label>
          <Select
            value={dataRoomsAccessAll}
            onValueChange={(value) => {
              const next = value as AccessLevel;
              onDataRoomsAccessAllChange(next);
              clearRoomsForAllRoomsAccess(next);
            }}
            disabled={disabled}
          >
            <SelectTrigger id={`${idPrefix}-data-rooms-access-all`}>
              <SelectValue placeholder="Select access" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Custom (select rooms)</SelectItem>
              <SelectItem value="viewer">Viewer (all rooms)</SelectItem>
              <SelectItem value="editor">Editor (all rooms)</SelectItem>
            </SelectContent>
          </Select>
          <p className="pt-1 text-xs text-muted-foreground">
            {dataRoomsAccessAll === "none"
              ? "Select specific data rooms below."
              : "Applies to all current and future data rooms."}
          </p>
        </div>
      </div>

      {dataRoomsAccessAll === "none" && (
        <div className="space-y-2 pt-2">
          <div className="flex items-center justify-between gap-2">
            <Label>Specific data rooms</Label>
            <span className="text-xs text-muted-foreground">
              Custom per room
            </span>
          </div>

          {workspaceDataRooms.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No data rooms found in this workspace.
            </p>
          ) : (
            <div className="space-y-2">
              {workspaceDataRooms.map((room) => {
                const isLocked = lockedDataRoomId === room.id;
                const checked = isLocked ? true : Boolean(roomAccess[room.id]);
                const level = (roomAccess[room.id] ??
                  (isLocked
                    ? lockedDataRoomDefaultLevel
                    : "viewer")) as RoomAccessLevel;

                const checkboxDisabled = disabled || isLocked;
                const levelDisabled = disabled;

                return (
                  <div
                    key={room.id}
                    className="flex items-center justify-between gap-3 rounded border border-border/60 bg-background/25 px-3 py-2"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(next) => {
                          if (isLocked) return;
                          const isChecked = Boolean(next);
                          if (isChecked) {
                            onRoomAccessChange({
                              ...roomAccess,
                              [room.id]: level,
                            });
                            return;
                          }

                          const copy = { ...roomAccess };
                          delete copy[room.id];
                          onRoomAccessChange(copy);
                        }}
                        disabled={checkboxDisabled}
                        aria-label={`Assign ${room.name || "data room"}`}
                      />
                      <span className="min-w-0 truncate text-sm">
                        {room.name ?? "Untitled"}
                        {isLocked ? (
                          <span className="ml-2 text-xs text-muted-foreground">
                            (required)
                          </span>
                        ) : null}
                      </span>
                    </div>

                    {checked ? (
                      <Select
                        value={level}
                        onValueChange={(value) => {
                          onRoomAccessChange({
                            ...roomAccess,
                            [room.id]: value as RoomAccessLevel,
                          });
                        }}
                        disabled={levelDisabled}
                      >
                        <SelectTrigger className="h-8 w-[130px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="viewer">Viewer</SelectItem>
                          <SelectItem value="editor">Editor</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
