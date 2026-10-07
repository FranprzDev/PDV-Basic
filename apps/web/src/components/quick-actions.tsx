"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import {
  Package,
  ScanBarcode,
  ShoppingCart,
  UserPlus,
  Wallet,
} from "lucide-react";

import { Button } from "@finopenpos/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@finopenpos/ui/components/dialog";
import { Input } from "@finopenpos/ui/components/input";
import { useTRPC } from "@/lib/trpc/client";
import { formatCurrency } from "@/lib/utils";
import { useBarcodeScanner } from "@/lib/scanner/use-barcode-scanner";

/** Evento global para que un atajo de teclado o el POS abra la búsqueda. */
export const OPEN_SCAN_EVENT = "pdv:open-scan";

interface QuickAction {
  href: string;
  label: string;
  hint: string;
  icon: typeof ShoppingCart;
  accent: string;
}

interface ScannedProduct {
  id: number;
  name: string;
  price: number;
  in_stock: number;
}

export function QuickActions() {
  const t = useTranslations("quickActions");
  const [scanOpen, setScanOpen] = useState(false);

  useEffect(() => {
    const open = () => setScanOpen(true);
    window.addEventListener(OPEN_SCAN_EVENT, open);
    return () => window.removeEventListener(OPEN_SCAN_EVENT, open);
  }, []);

  const links: QuickAction[] = [
    {
      href: "/admin/pos",
      label: t("newSale"),
      hint: t("newSaleHint"),
      icon: ShoppingCart,
      accent: "text-emerald-600",
    },
    {
      href: "/admin/products",
      label: t("newProduct"),
      hint: t("newProductHint"),
      icon: Package,
      accent: "text-sky-600",
    },
    {
      href: "/admin/customers",
      label: t("newCustomer"),
      hint: t("newCustomerHint"),
      icon: UserPlus,
      accent: "text-violet-600",
    },
    {
      href: "/admin/cashier",
      label: t("cashMovement"),
      hint: t("cashMovementHint"),
      icon: Wallet,
      accent: "text-amber-600",
    },
  ];

  return (
    <section className="grid gap-3" aria-label={t("title")}>
      <div>
        <h2 className="text-base font-semibold">{t("title")}</h2>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {links.map((action) => (
          <Link
            key={action.href}
            href={action.href}
            className="flex items-start gap-3 rounded-xl border bg-card p-4 transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <action.icon
              className={`mt-0.5 h-5 w-5 shrink-0 ${action.accent}`}
            />
            <span className="min-w-0">
              <span className="block text-sm font-medium">{action.label}</span>
              <span className="block text-xs text-muted-foreground">
                {action.hint}
              </span>
            </span>
          </Link>
        ))}

        <Button
          variant="outline"
          className="h-auto items-start justify-start gap-3 p-4 text-left"
          onClick={() => setScanOpen(true)}
        >
          <ScanBarcode className="mt-0.5 h-5 w-5 shrink-0 text-indigo-600" />
          <span className="min-w-0">
            <span className="block text-sm font-medium">
              {t("scanPrice")}
            </span>
            <span className="block text-xs font-normal text-muted-foreground">
              {t("scanPriceHint")}
            </span>
          </span>
        </Button>
      </div>

      <ScanPriceDialog open={scanOpen} onOpenChange={setScanOpen} />
    </section>
  );
}

function ScanPriceDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const ts = useTranslations("scanner");
  const locale = useLocale();
  const trpc = useTRPC();

  const [code, setCode] = useState("");
  const [searchedCode, setSearchedCode] = useState("");

  const lookup = useQuery({
    ...trpc.products.lookup.queryOptions({ barcode: searchedCode }),
    enabled: searchedCode.length > 0,
  });

  const handleCode = (raw: string) => {
    const scanned = raw.trim();
    if (!scanned) return;
    setCode(scanned);
    setSearchedCode(scanned);
  };

  useBarcodeScanner({
    onScan: (scanned) => {
      if (open) handleCode(scanned);
    },
  });

  const handleOpenChange = (next: boolean) => {
    onOpenChange(next);
    if (!next) {
      setCode("");
      setSearchedCode("");
    }
  };

  const found = searchedCode ? lookup.data?.product : null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{ts("title")}</DialogTitle>
          <DialogDescription>{ts("hint")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Input
            autoFocus
            placeholder="7798145678903"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCode(code);
            }}
          />

          {lookup.isFetching && (
            <p className="text-sm text-muted-foreground">{ts("listening")}…</p>
          )}

          {found && (
            <div className="flex items-start justify-between gap-4 rounded-lg border p-4">
              <div className="min-w-0">
                <p className="font-medium">{found.name}</p>
                <p className="text-xs text-muted-foreground">
                  {found.in_stock} en stock
                </p>
              </div>
              <p className="shrink-0 text-lg font-bold">
                {formatCurrency(found.price, locale)}
              </p>
            </div>
          )}

          {searchedCode && !lookup.isFetching && !found && (
            <div className="rounded-lg border border-dashed p-4 text-sm">
              <p className="font-medium">{ts("notFound", { code: searchedCode })}</p>
              <p className="text-muted-foreground">{ts("notFoundHint")}</p>
              <Button asChild className="mt-3" size="sm">
                <Link
                  href={`/admin/products?barcode=${encodeURIComponent(searchedCode)}`}
                >
                  {ts("createFromBarcode")}
                </Link>
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}