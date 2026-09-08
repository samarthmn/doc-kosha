import React from "react";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import {
  ArrowSquareOut,
  FolderOpen,
  UploadSimple,
} from "@phosphor-icons/react/ssr";

interface RecentDataRoom {
  id: string;
  name: string;
  created_at: string;
  description: string | null;
}

interface RecentDataRoomsProps {
  dataRooms: RecentDataRoom[];
}

export const RecentDataRooms: React.FC<RecentDataRoomsProps> = ({
  dataRooms,
}) => {
  return (
    <Card className="h-full border-border/70 bg-card/55">
      <CardHeader className="border-b border-border/50 pb-3">
        <CardTitle className="text-[0.95rem] font-medium">
          Recent Data Rooms
        </CardTitle>
        <CardDescription className="text-xs">
          Recently created data rooms
        </CardDescription>
      </CardHeader>
      <CardContent
        className={
          dataRooms.length === 0
            ? "flex h-[200px] flex-col items-center justify-center"
            : undefined
        }
      >
        {dataRooms.length === 0 ? (
          <EmptyState
            variant="bare"
            compact
            icon={
              <UploadSimple
                className="h-6 w-6 text-muted-foreground"
                aria-hidden
              />
            }
            title="No data rooms found"
            description="Create your first data room to get started."
            actions={
              <Button asChild size="sm">
                <Link href="/data-rooms">Go to Data Rooms</Link>
              </Button>
            }
          />
        ) : (
          <div className="divide-y divide-border/50">
            {dataRooms.map((room) => (
              <div
                key={room.id}
                className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
              >
                <div className="flex items-center gap-3">
                  <div className="flex size-8 items-center justify-center rounded border border-primary/20 bg-primary/10">
                    <FolderOpen className="size-4 text-primary" aria-hidden />
                  </div>
                  <div className="space-y-1">
                    <p className="max-w-[200px] truncate text-sm font-medium">
                      {room.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(room.created_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <Link
                  href={`/data-rooms/${room.id}/documents`}
                  className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
                >
                  <ArrowSquareOut className="size-4" aria-hidden />
                  <span className="sr-only">View</span>
                </Link>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
