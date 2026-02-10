"use client";

import { motion } from "framer-motion";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { useStats } from "@/hooks/use-stats";

export function CallActivityChart() {
  const { callsByDay, maxCallsInDay } = useStats();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Call Activity</CardTitle>
        <CardDescription>Last 7 days</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex h-48 items-end justify-between gap-2">
          {callsByDay.map((day, i) => {
            const heightPercent =
              maxCallsInDay > 0
                ? (day.count / maxCallsInDay) * 100
                : 0;

            return (
              <div
                key={day.date}
                className="group flex flex-1 flex-col items-center gap-1"
              >
                <span className="text-xs font-medium text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
                  {day.count}
                </span>
                <div className="relative flex w-full items-end justify-center" style={{ height: "100%" }}>
                  <motion.div
                    initial={{ height: 0 }}
                    animate={{ height: `${Math.max(heightPercent, 2)}%` }}
                    transition={{
                      delay: i * 0.08,
                      duration: 0.6,
                      ease: [0.21, 0.47, 0.32, 0.98],
                    }}
                    className="w-full max-w-[40px] rounded-t-sm bg-gradient-to-t from-violet-500 to-indigo-400"
                    style={{ minHeight: "4px" }}
                  />
                </div>
                <span className="text-xs text-muted-foreground">
                  {day.date}
                </span>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
