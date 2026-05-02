"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { CalculatedItem, TakeoffCategory } from "@/types";

interface CalculationSummaryProps {
  items: CalculatedItem[];
}

const TRADE_LABELS: Record<TakeoffCategory, string> = {
  concrete: "Concrete",
  framing: "Framing",
  sheathing: "Sheathing",
  insulation: "Insulation",
  drywall: "Drywall",
  roofing: "Roofing",
  openings: "Openings",
};

const TRADE_ORDER: TakeoffCategory[] = [
  "concrete",
  "framing",
  "sheathing",
  "insulation",
  "drywall",
  "roofing",
  "openings",
];

export function CalculationSummary({ items }: CalculationSummaryProps) {
  return (
    <div className="space-y-5">
      {/* Overview cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
        {TRADE_ORDER.map((cat) => {
          const catItems = items.filter((i) => i.category === cat);
          return (
            <Card
              key={cat}
              className="rounded-[24px] border-white/70 bg-white/95 shadow-[0_18px_38px_rgba(15,42,64,0.12)]"
            >
              <CardContent className="px-4 pb-4 pt-5 text-center">
                <div className="text-2xl font-bold text-[#173f5f]">
                  {catItems.length}
                </div>
                <div className="mt-1 text-[11px] uppercase tracking-[0.18em] text-slate-400">
                  {TRADE_LABELS[cat]}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Detail tabs */}
      <Tabs defaultValue={TRADE_ORDER[0]} className="w-full">
        <TabsList className="grid h-auto w-full grid-cols-2 gap-2 rounded-[24px] border border-white/60 bg-white/90 p-2 shadow-[0_18px_38px_rgba(15,42,64,0.12)] md:grid-cols-4 xl:grid-cols-7">
          {TRADE_ORDER.map((cat) => (
            <TabsTrigger
              key={cat}
              value={cat}
              className="rounded-2xl py-2 text-xs uppercase tracking-[0.16em]"
            >
              {TRADE_LABELS[cat]}
            </TabsTrigger>
          ))}
        </TabsList>

        {TRADE_ORDER.map((cat) => {
          const catItems = items.filter((i) => i.category === cat);
          return (
            <TabsContent key={cat} value={cat} className="mt-4">
              <Card className="rounded-[28px] border-white/70 bg-white/95 shadow-[0_18px_38px_rgba(15,42,64,0.12)]">
                <CardHeader>
                  <CardTitle className="text-[#173f5f]">
                    {TRADE_LABELS[cat]} Takeoff
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[300px]">Item</TableHead>
                        <TableHead className="text-right">Qty</TableHead>
                        <TableHead>Unit</TableHead>
                        <TableHead className="text-right">Waste</TableHead>
                        <TableHead className="text-right">
                          Total (w/ waste)
                        </TableHead>
                        <TableHead>Notes</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {catItems.map((item, i) => (
                        <TableRow key={i}>
                          <TableCell className="font-medium text-slate-700">
                            {item.description}
                          </TableCell>
                          <TableCell className="text-right">
                            {item.quantity.toLocaleString()}
                          </TableCell>
                          <TableCell>{item.unit}</TableCell>
                          <TableCell className="text-right">
                            {(item.wasteFactor * 100).toFixed(0)}%
                          </TableCell>
                          <TableCell className="text-right font-medium text-[#173f5f]">
                            {item.totalWithWaste.toLocaleString()}
                          </TableCell>
                          <TableCell className="text-slate-500">
                            {item.notes}
                          </TableCell>
                        </TableRow>
                      ))}
                      {catItems.length === 0 && (
                        <TableRow>
                          <TableCell
                            colSpan={6}
                            className="py-8 text-center text-slate-500"
                          >
                            No {TRADE_LABELS[cat].toLowerCase()} quantity lines
                            yet.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>
          );
        })}
      </Tabs>
    </div>
  );
}
