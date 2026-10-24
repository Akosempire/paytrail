import { FileQuestion } from "lucide-react";
import { Button, EmptyState, Logo } from "@/components/ui";

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-8 bg-canvas px-4">
      <Logo withWord />
      <div className="w-full max-w-md">
        <EmptyState icon={FileQuestion} title="We couldn't find that page" description="The link may be mistyped, or the document may have been removed." action={<Button href="/" variant="primary">Go home</Button>} />
      </div>
    </div>
  );
}
