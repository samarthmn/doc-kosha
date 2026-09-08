import type { Metadata, ResolvingMetadata } from "next";
import DataRoomAnalyticsRouteClient from "@/components/pages/DataRoomAnalyticsRouteClient";

interface Params {
  dataRoomId: string;
}

type Props = PageProps<"/data-rooms/[dataRoomId]/analytics">;

const DataRoomAnalyticsPage: React.FC<Props> = async () => {
  return <DataRoomAnalyticsRouteClient />;
};

export default DataRoomAnalyticsPage;

export async function generateMetadata(
  { params }: Props,
  _parent: ResolvingMetadata,
): Promise<Metadata> {
  const p = (await params) as Params;
  return {
    title: `Analytics – ${p.dataRoomId}`,
    alternates: {
      canonical: `/data-rooms/${p.dataRoomId}/analytics`,
    },
  };
}
