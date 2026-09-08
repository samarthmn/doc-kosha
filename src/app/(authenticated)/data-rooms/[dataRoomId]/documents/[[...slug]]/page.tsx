import type { Metadata, ResolvingMetadata } from "next";
import DataRoomDocumentsRouteClient from "@/components/pages/DataRoomDocumentsRouteClient";

interface Params {
  dataRoomId: string;
  slug?: string[];
}

type Props = PageProps<"/data-rooms/[dataRoomId]/documents/[[...slug]]">;

const DataRoomDocumentsPage: React.FC<Props> = async ({ params }) => {
  const p = (await params) as Params;
  return <DataRoomDocumentsRouteClient slug={p.slug} />;
};

export default DataRoomDocumentsPage;

export async function generateMetadata(
  { params }: Props,
  _parent: ResolvingMetadata,
): Promise<Metadata> {
  const p = (await params) as Params;
  const suffix = p.slug && p.slug.length ? ` / ${p.slug.join(" / ")}` : "";
  return {
    title: `Data Room – ${p.dataRoomId}${suffix}`,
    alternates: {
      canonical: `/data-rooms/${p.dataRoomId}/documents${p.slug && p.slug.length ? `/${p.slug.join("/")}` : ""}`,
    },
  };
}
