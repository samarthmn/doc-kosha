import DataRoomsClient from "@/components/pages/DataRoomsClient";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Data Rooms",
  alternates: { canonical: "/data-rooms" },
};

const DataRoomsPage: React.FC<PageProps<"/data-rooms">> = () => {
  return <DataRoomsClient />;
};

export default DataRoomsPage;
