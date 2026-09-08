import type { Metadata } from "next";
import DemoWorkflowPage from "@/components/marketing/pages/DemoWorkflowPage";
import {
  getAllDemoWorkflows,
  getDemoWorkflowBySlug,
} from "@/modules/demos/catalog";

type Params = {
  slug: string;
};

type Props = {
  params: Promise<Params>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export const dynamicParams = false;

export const generateStaticParams = async () =>
  getAllDemoWorkflows().map((workflow) => ({ slug: workflow.slug }));

export const generateMetadata = async ({
  params,
}: Props): Promise<Metadata> => {
  const { slug } = await params;
  const workflow = getDemoWorkflowBySlug(slug);

  if (!workflow) {
    return {
      title: "Demo not found",
      description: "The requested demo was not found.",
      robots: { index: false, follow: false },
    };
  }

  return {
    title: `${workflow.title} | DocKosha Demos`,
    description: workflow.description,
    alternates: { canonical: `/demos/${workflow.slug}` },
  };
};

const DemoWorkflowRoutePage: React.FC<Props> = async ({
  params,
  searchParams,
}) => {
  const { slug } = await params;
  const query = await searchParams;

  return <DemoWorkflowPage slug={slug} rawStep={query?.step} />;
};

export default DemoWorkflowRoutePage;
