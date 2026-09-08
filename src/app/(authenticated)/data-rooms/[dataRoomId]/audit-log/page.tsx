import DataRoomAuditLogClient from "@/components/pages/DataRoomAuditLogClient";
import type { Metadata, ResolvingMetadata } from "next";

interface Params {
  dataRoomId: string;
}

type Props = PageProps<"/data-rooms/[dataRoomId]/audit-log">;

const DataRoomAuditLogPage: React.FC<Props> = async () => {
  return <DataRoomAuditLogClient />;
};

export default DataRoomAuditLogPage;

export async function generateMetadata(
  { params }: Props,
  _parent: ResolvingMetadata,
): Promise<Metadata> {
  const p = (await params) as Params;
  return {
    title: `Audit log – ${p.dataRoomId}`,
    alternates: {
      canonical: `/data-rooms/${p.dataRoomId}/audit-log`,
    },
  };
}
