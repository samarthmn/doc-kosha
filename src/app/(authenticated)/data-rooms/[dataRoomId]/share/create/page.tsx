import type { Metadata, ResolvingMetadata } from "next";
import DataRoomShareRouteClient from "@/components/pages/DataRoomShareRouteClient";

interface Params {
  dataRoomId: string;
}

type Props = {
  params: Promise<Params>;
};

const DataRoomShareCreatePage: React.FC<Props> = async () => {
  return <DataRoomShareRouteClient />;
};

export default DataRoomShareCreatePage;

export async function generateMetadata(
  { params }: Props,
  _parent: ResolvingMetadata,
): Promise<Metadata> {
  const p = await params;
  return {
    title: `Share – ${p.dataRoomId}`,
    alternates: {
      canonical: `/data-rooms/${p.dataRoomId}/share/create`,
    },
  };
}
