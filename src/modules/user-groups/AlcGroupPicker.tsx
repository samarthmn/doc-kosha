"use client";

import React, { useCallback } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { AlcGroupPickerProps } from "./types";
import { cn } from "@/lib/utils";
import { CaretDown, Users } from "@phosphor-icons/react";

/**
 * The group rule-type section of the link-ALC rules dialog. The core dialog
 * renders this through the groups feature loader; email rules remain
 * available alongside group rules.
 */
const AlcGroupPicker: React.FC<AlcGroupPickerProps> = ({
  label,
  userGroups,
  value,
  onChange,
  disabled,
}) => {
  const toggle = useCallback(
    (groupId: string, checked: boolean) => {
      const next = checked
        ? Array.from(new Set([...value, groupId]))
        : value.filter((id) => id !== groupId);
      onChange(next);
    },
    [onChange, value],
  );

  const selectedCount = value.length;
  const buttonLabel =
    selectedCount > 0
      ? `${selectedCount} group${selectedCount === 1 ? "" : "s"} selected`
      : "Select groups";

  return (
    <div className="space-y-2">
      <Label className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
        {label}
      </Label>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled}
            className="h-9 w-full justify-between font-normal"
          >
            <span className="flex items-center">
              <Users
                className="mr-2 h-4 w-4 text-muted-foreground"
                aria-hidden
              />
              {buttonLabel}
            </span>
            <CaretDown aria-hidden className="h-4 w-4 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[320px] p-2" align="start">
          {userGroups.length > 0 ? (
            <div className="max-h-64 space-y-1 overflow-y-auto p-1">
              {userGroups.map((group) => {
                const checked = value.includes(group.id);
                return (
                  <label
                    key={group.id}
                    className={cn(
                      "flex cursor-pointer items-start gap-3 rounded-md px-2 py-2 transition-colors hover:bg-accent/50",
                      disabled ? "cursor-not-allowed opacity-60" : "",
                    )}
                  >
                    <Checkbox
                      checked={checked}
                      disabled={disabled}
                      onCheckedChange={(v) => toggle(group.id, Boolean(v))}
                      aria-label={`Allow ${group.name}`}
                      className="mt-0.5"
                    />
                    <span className="min-w-0 space-y-0.5">
                      <span className="block truncate text-sm font-medium">
                        {group.name}
                      </span>
                      <span className="block text-xs text-muted-foreground tabular-nums">
                        {group.emailCount} email
                        {group.emailCount === 1 ? "" : "s"}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          ) : (
            <div className="space-y-2 p-2 text-center">
              <p className="text-xs text-muted-foreground">
                No user groups found.
              </p>
              <Link
                href="/user-groups"
                className={cn(
                  buttonVariants({ variant: "link", size: "sm" }),
                  "h-auto px-0 py-0",
                )}
              >
                Manage user groups
              </Link>
            </div>
          )}
        </PopoverContent>
      </Popover>
      {selectedCount > 0 ? (
        <div className="flex flex-wrap gap-1">
          {userGroups
            .filter((g) => value.includes(g.id))
            .map((g) => (
              <Badge
                key={g.id}
                variant="outline"
                className="text-xs font-normal"
              >
                {g.name}
              </Badge>
            ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground italic">
          No groups selected.
        </p>
      )}
    </div>
  );
};

export default AlcGroupPicker;
