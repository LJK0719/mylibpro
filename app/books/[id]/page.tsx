import BookDetailPageClient from "@/components/library/BookDetailPageClient";

export default function BookDetailPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    return <BookDetailPageClient params={params} />;
}
