import { ChevronDown } from "lucide-react";
import { Card } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface CollapsibleSectionProps {
  title: string;
  badge?: string;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  height: number | string;
  children: React.ReactNode;
  className?: string;
}

export default function CollapsibleSection({
  title,
  badge,
  collapsed,
  onToggleCollapsed,
  height,
  children,
  className,
}: CollapsibleSectionProps) {
  return (
    <Collapsible open={!collapsed} onOpenChange={() => onToggleCollapsed()}>
      <Card
        className={cn(
          "flex flex-col overflow-hidden shadow-lg transition-all duration-300 ease-in-out gap-0 py-0",
          className,
        )}
        style={{ height }}
      >
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className={cn(
              "flex w-full cursor-pointer items-center justify-between px-4 py-3",
              !collapsed && "border-b border-border",
            )}
          >
            <h3 className="text-sm font-semibold">
              {title}
              {badge && (
                <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                  {badge}
                </span>
              )}
            </h3>
            <ChevronDown
              className={cn(
                "h-4 w-4 text-muted-foreground transition-transform duration-300",
                collapsed && "rotate-180",
              )}
            />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {children}
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
