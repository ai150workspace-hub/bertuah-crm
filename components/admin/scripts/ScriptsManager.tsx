"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Zap } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import type { ScriptContentRow, ScriptSection } from "@/lib/scripts";
import type { WaTemplateAdminRow } from "@/lib/wa-templates";
import {
  createScriptContent,
  updateScriptContent,
  toggleScriptContentActive,
  updateWaTemplate,
  toggleWaTemplateActive,
  type ScriptContentInput,
} from "@/app/actions/scripts";

const SECTION_LABEL: Record<ScriptSection, string> = {
  opening: "Opening",
  probing: "Probing",
  presentasi: "Presentasi",
  closing: "Closing",
  objection_handling: "Handling Penolakan",
};

const SECTION_ORDER: ScriptSection[] = [
  "opening",
  "probing",
  "presentasi",
  "closing",
  "objection_handling",
];

const SCRIPT_PLACEHOLDER_HINT =
  "Placeholder yang bisa dipakai: {{nama}}, {{kendaraan}}, {{tahun}}, {{merk}}, {{jumlah}}, {{cicilan}}, {{tenor}}";
const WA_PLACEHOLDER_HINT =
  SCRIPT_PLACEHOLDER_HINT + ", {{hari_tanggal}}, {{jam}}, {{alamat}}, {{bulan}}, {{promo}}";

function truncate(text: string, max = 90): string {
  return text.length > max ? text.slice(0, max) + "…" : text;
}

interface ScriptFormState {
  scenarioName: string;
  category: string;
  scriptText: string;
  tipsText: string;
  escalationRule: string;
  isBuyingSignal: boolean;
  displayOrder: string;
}

function emptyForm(nextOrder: number): ScriptFormState {
  return {
    scenarioName: "",
    category: "",
    scriptText: "",
    tipsText: "",
    escalationRule: "",
    isBuyingSignal: false,
    displayOrder: String(nextOrder),
  };
}

function rowToForm(row: ScriptContentRow): ScriptFormState {
  return {
    scenarioName: row.scenarioName,
    category: row.category ?? "",
    scriptText: row.scriptText,
    tipsText: row.tipsText ?? "",
    escalationRule: row.escalationRule ?? "",
    isBuyingSignal: row.isBuyingSignal,
    displayOrder: String(row.displayOrder),
  };
}

function ScriptSectionTab({
  section,
  rows,
}: {
  section: ScriptSection;
  rows: ScriptContentRow[];
}) {
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ScriptFormState>(emptyForm(1));
  const [saving, setSaving] = useState(false);

  const isObjection = section === "objection_handling";

  function openAdd() {
    const nextOrder = rows.length > 0 ? Math.max(...rows.map((r) => r.displayOrder)) + 1 : 1;
    setEditingId(null);
    setForm(emptyForm(nextOrder));
    setDialogOpen(true);
  }

  function openEdit(row: ScriptContentRow) {
    setEditingId(row.id);
    setForm(rowToForm(row));
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!form.scenarioName.trim() || !form.scriptText.trim()) {
      toast.error("Nama skenario dan isi script wajib diisi.");
      return;
    }
    const displayOrder = Number(form.displayOrder);
    if (!Number.isFinite(displayOrder)) {
      toast.error("Urutan tampil harus angka.");
      return;
    }
    const duplicate = rows.find((r) => r.displayOrder === displayOrder && r.id !== editingId);
    if (duplicate) {
      toast.error(`Urutan ${displayOrder} sudah dipakai "${duplicate.scenarioName}" — pilih angka lain.`);
      return;
    }

    const input: ScriptContentInput = {
      section,
      scenarioName: form.scenarioName.trim(),
      category: isObjection ? form.category.trim() || null : null,
      scriptText: form.scriptText,
      tipsText: form.tipsText.trim() || null,
      escalationRule: isObjection ? form.escalationRule.trim() || null : null,
      isBuyingSignal: isObjection ? form.isBuyingSignal : false,
      displayOrder,
    };

    setSaving(true);
    const result = editingId
      ? await updateScriptContent(editingId, input)
      : await createScriptContent(input);
    setSaving(false);

    if (!result.success) {
      toast.error("Gagal menyimpan.", { description: result.error });
      return;
    }
    toast.success("Script tersimpan.");
    setDialogOpen(false);
    router.refresh();
  }

  async function handleToggleActive(row: ScriptContentRow) {
    const result = await toggleScriptContentActive(row.id, !row.isActive);
    if (!result.success) {
      toast.error("Gagal ubah status.", { description: result.error });
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button size="sm" onClick={openAdd}>
          <Plus className="h-3.5 w-3.5" /> Tambah Script Baru
        </Button>
      </div>

      <div className="rounded-lg border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Scenario</TableHead>
              {isObjection && <TableHead>Category</TableHead>}
              <TableHead>Preview Script</TableHead>
              <TableHead>Urutan</TableHead>
              <TableHead>Aktif</TableHead>
              <TableHead className="text-right">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="font-medium">
                  {row.scenarioName}
                  {row.isBuyingSignal && (
                    <Badge className="ml-1.5 bg-amber-500/15 text-amber-600 border-amber-500/30 text-[10px] dark:text-amber-400">
                      <Zap className="h-2.5 w-2.5" /> Buying Signal
                    </Badge>
                  )}
                </TableCell>
                {isObjection && (
                  <TableCell className="text-xs text-muted-foreground">{row.category}</TableCell>
                )}
                <TableCell className="text-xs text-muted-foreground max-w-xs">
                  {truncate(row.scriptText)}
                </TableCell>
                <TableCell>{row.displayOrder}</TableCell>
                <TableCell>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => handleToggleActive(row)}
                  >
                    {row.isActive ? "Aktif" : "Nonaktif"}
                  </Button>
                </TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="sm" onClick={() => openEdit(row)}>
                    <Pencil className="h-3.5 w-3.5" /> Edit
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={isObjection ? 6 : 5} className="text-center text-muted-foreground py-8">
                  Belum ada script di section ini.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingId ? "Edit Script" : "Tambah Script Baru"} — {SECTION_LABEL[section]}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Nama Skenario</Label>
              <Input
                value={form.scenarioName}
                onChange={(e) => setForm({ ...form, scenarioName: e.target.value })}
              />
            </div>

            {isObjection && (
              <div className="space-y-1.5">
                <Label className="text-xs">Category</Label>
                <Input
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  placeholder='mis. "Rejection - Soft", "Buying Signal"'
                />
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs">Isi Script</Label>
              <Textarea
                value={form.scriptText}
                onChange={(e) => setForm({ ...form, scriptText: e.target.value })}
                rows={6}
              />
              <p className="text-[11px] text-muted-foreground">{SCRIPT_PLACEHOLDER_HINT}</p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Tips (opsional)</Label>
              <Textarea
                value={form.tipsText}
                onChange={(e) => setForm({ ...form, tipsText: e.target.value })}
                rows={2}
              />
            </div>

            {isObjection && (
              <>
                <div className="space-y-1.5">
                  <Label className="text-xs">Aturan Selanjutnya (escalation)</Label>
                  <Textarea
                    value={form.escalationRule}
                    onChange={(e) => setForm({ ...form, escalationRule: e.target.value })}
                    rows={2}
                  />
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.isBuyingSignal}
                    onChange={(e) => setForm({ ...form, isBuyingSignal: e.target.checked })}
                  />
                  Tandai sebagai Buying Signal (badge ⚡)
                </label>
              </>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs">Urutan Tampil</Label>
              <Input
                type="number"
                value={form.displayOrder}
                onChange={(e) => setForm({ ...form, displayOrder: e.target.value })}
                className="w-24"
              />
            </div>
          </div>

          <DialogFooter>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Menyimpan..." : "Simpan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface WaFormState {
  templateName: string;
  templateText: string;
  whenToUse: string;
}

function WaTemplatesTab({ templates }: { templates: WaTemplateAdminRow[] }) {
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<WaTemplateAdminRow | null>(null);
  const [form, setForm] = useState<WaFormState>({ templateName: "", templateText: "", whenToUse: "" });
  const [saving, setSaving] = useState(false);

  function openEdit(row: WaTemplateAdminRow) {
    setEditing(row);
    setForm({
      templateName: row.templateName,
      templateText: row.templateText,
      whenToUse: row.whenToUse ?? "",
    });
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!editing) return;
    if (!form.templateName.trim() || !form.templateText.trim()) {
      toast.error("Nama dan isi template wajib diisi.");
      return;
    }
    setSaving(true);
    const result = await updateWaTemplate(editing.templateKey, {
      templateName: form.templateName.trim(),
      templateText: form.templateText,
      whenToUse: form.whenToUse.trim() || null,
    });
    setSaving(false);
    if (!result.success) {
      toast.error("Gagal menyimpan.", { description: result.error });
      return;
    }
    toast.success("Template tersimpan.");
    setDialogOpen(false);
    router.refresh();
  }

  async function handleToggleActive(row: WaTemplateAdminRow) {
    const result = await toggleWaTemplateActive(row.templateKey, !row.isActive);
    if (!result.success) {
      toast.error("Gagal ubah status.", { description: result.error });
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        4 jenis template WA sudah ditentukan (tidak bisa ditambah/dihapus) — hanya isinya yang bisa diedit.
      </p>

      <div className="rounded-lg border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nama Template</TableHead>
              <TableHead>Kapan Dipakai</TableHead>
              <TableHead>Preview</TableHead>
              <TableHead>Aktif</TableHead>
              <TableHead className="text-right">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {templates.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="font-medium">{row.templateName}</TableCell>
                <TableCell className="text-xs text-muted-foreground max-w-xs">
                  {row.whenToUse ? truncate(row.whenToUse, 60) : "—"}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground max-w-xs">
                  {truncate(row.templateText.replace(/\n/g, " "))}
                </TableCell>
                <TableCell>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => handleToggleActive(row)}
                  >
                    {row.isActive ? "Aktif" : "Nonaktif"}
                  </Button>
                </TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="sm" onClick={() => openEdit(row)}>
                    <Pencil className="h-3.5 w-3.5" /> Edit
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Template — {editing?.templateName}</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Nama Template</Label>
              <Input
                value={form.templateName}
                onChange={(e) => setForm({ ...form, templateName: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Isi Template</Label>
              <Textarea
                value={form.templateText}
                onChange={(e) => setForm({ ...form, templateText: e.target.value })}
                rows={10}
              />
              <p className="text-[11px] text-muted-foreground">{WA_PLACEHOLDER_HINT}</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Kapan Dipakai (opsional)</Label>
              <Textarea
                value={form.whenToUse}
                onChange={(e) => setForm({ ...form, whenToUse: e.target.value })}
                rows={2}
              />
            </div>
          </div>

          <DialogFooter>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Menyimpan..." : "Simpan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function ScriptsManager({
  scripts,
  waTemplates,
}: {
  scripts: ScriptContentRow[];
  waTemplates: WaTemplateAdminRow[];
}) {
  const bySection = new Map<ScriptSection, ScriptContentRow[]>();
  for (const row of scripts) {
    const arr = bySection.get(row.section) ?? [];
    arr.push(row);
    bySection.set(row.section, arr);
  }

  return (
    <Tabs defaultValue="opening">
      <TabsList className="flex-wrap h-auto">
        {SECTION_ORDER.map((section) => (
          <TabsTrigger key={section} value={section}>
            {SECTION_LABEL[section]}
          </TabsTrigger>
        ))}
        <TabsTrigger value="wa_templates">WA Templates</TabsTrigger>
      </TabsList>
      {SECTION_ORDER.map((section) => (
        <TabsContent key={section} value={section} className="mt-4">
          <ScriptSectionTab section={section} rows={bySection.get(section) ?? []} />
        </TabsContent>
      ))}
      <TabsContent value="wa_templates" className="mt-4">
        <WaTemplatesTab templates={waTemplates} />
      </TabsContent>
    </Tabs>
  );
}
