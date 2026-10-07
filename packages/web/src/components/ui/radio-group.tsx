"use client";

import { Radio as RadioPrimitive } from "@base-ui/react/radio";
import { RadioGroup as RadioGroupPrimitive } from "@base-ui/react/radio-group";

import { cn } from "../../lib/utils.ts";

function RadioGroup({ className, ...props }: RadioGroupPrimitive.Props) {
  return (
    <RadioGroupPrimitive
      className={cn("flex flex-col gap-3", className)}
      data-slot="radio-group"
      {...props}
    />
  );
}

function Radio({ className, ...props }: RadioPrimitive.Root.Props) {
  return (
    <RadioPrimitive.Root
      className={cn(
        "relative inline-flex size-4.5 shrink-0 cursor-pointer items-center justify-center rounded-full border border-input bg-background outline-none transition-[background-color,border-color,box-shadow] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background data-checked:border-primary data-checked:bg-primary data-disabled:cursor-not-allowed data-disabled:opacity-64 sm:size-4 dark:bg-input/32",
        className,
      )}
      data-slot="radio"
      {...props}
    >
      <RadioPrimitive.Indicator
        className="flex size-full items-center justify-center before:size-1.5 before:rounded-full before:bg-primary-foreground data-unchecked:hidden"
        data-slot="radio-indicator"
      />
    </RadioPrimitive.Root>
  );
}

export { RadioGroup, Radio };
