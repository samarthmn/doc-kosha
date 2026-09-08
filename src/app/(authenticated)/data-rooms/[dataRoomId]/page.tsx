import { redirect } from "next/navigation";
import type { Metadata, ResolvingMetadata } from "next";

const DataRoomPage: React.FC<PageProps<"/data-rooms/[dataRoomId]">> = async ({
  params,
}) => {
  const p = (await params) as { dataRoomId: string };
  redirect(`/data-rooms/${p.dataRoomId}/documents`);
};

export default DataRoomPage;

type Props = PageProps<"/data-rooms/[dataRoomId]">;

export async function generateMetadata(
  { params }: Props,
  _parent: ResolvingMetadata,
): Promise<Metadata> {
  const p = (await params) as { dataRoomId: string };
  return {
    title: `Data Room – ${p.dataRoomId}`,
    alternates: { canonical: `/data-rooms/${p.dataRoomId}` },
  };
}
