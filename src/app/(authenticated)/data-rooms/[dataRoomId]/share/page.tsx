import type { Metadata, ResolvingMetadata } from "next";
import DataRoomShareRouteClient from "@/components/pages/DataRoomShareRouteClient";

interface Params {
  dataRoomId: string;
}

type Props = PageProps<"/data-rooms/[dataRoomId]/share">;

const DataRoomSharePage: React.FC<Props> = async () => {
  return <DataRoomShareRouteClient />;
};

export default DataRoomSharePage;

export async function generateMetadata(
  { params }: Props,
  _parent: ResolvingMetadata,
): Promise<Metadata> {
  const p = (await params) as Params;
  return {
    title: `Share – ${p.dataRoomId}`,
    alternates: {
      canonical: `/data-rooms/${p.dataRoomId}/share`,
    },
  };
}
