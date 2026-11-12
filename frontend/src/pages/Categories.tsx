import { useExplicitAction } from "../query/useExplicitAction";
import { emptyList, useCategories, useRules, useCategoryCatalog } from "../query/shared";
import { useWriteActions } from "../query/writes";
import { CategoryLearning } from "../components/CategoryLearning";
import { CategoryDetailsPanel, type CategoryDetailsView } from "../components/CategoryDetailsPanel";
import { SubcategoryOrderModal } from "../components/SubcategoryOrderModal";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import {
  Button,
  ChevronDownIcon,
  EmptyState,
  ErrorState,
  LoadingState,
  MoreVerticalIcon,
  PageIntro,
  Panel,
  PlusIcon,
  StatusNotice,
  TrashIcon,
  cn,
} from "../components";
import { createCategoryMap, getCategoryPath, groupCategories } from "../lib";
import { CategoryService } from "../services";
import { CategoryType } from "../types";
import type { Category } from "../types";
import { CategoryIcon, CATEGORY_ICONS, CATEGORY_COLORS, categoryAppearance } from "../components/CategoryIcon";

type CategoryForm = {
  id: number | null;
  name: string;
  type: CategoryType;
  parent_id: string;
  sort_order: string;
  icon: string;
  color: string;
  code: string | null;
};

const typeLabels: Record<CategoryType, string> = {
  [CategoryType.INCOME]: "Ingreso",
  [CategoryType.EXPENSE]: "Gasto",
  [CategoryType.TRANSFER]: "Transferencia",
};

const normalizeCatalogSearch = (value: string) => value.normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es").trim();

const typeBadgeClasses: Record<CategoryType, string> = {
  [CategoryType.INCOME]: "bg-primary-mist text-primary",
  [CategoryType.EXPENSE]: "bg-danger-soft text-danger",
  [CategoryType.TRANSFER]: "bg-blue-100 text-blue-700",
};

const categoryActionClass = "!min-h-10 !rounded-xl !border-outline !bg-white !px-2 !py-2 !text-xs !text-ink hover:!border-primary/40 hover:!text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary sm:!px-3 sm:!text-sm";

function canMergeCategory(category: Category, categories: Category[]) {
  return !category.is_default
    && !categories.some(item => item.parent_id === category.id)
    && categories.some(item => item.id !== category.id && item.type === category.type && item.is_active);
}

type CategoryActionsProps = {
  category: Category;
  canMerge: boolean;
  onCreateSubcategory?: (category: Category) => void;
  onViewRules?: (category: Category) => void;
  onReorder?: (category: Category) => void;
  onEdit: (category: Category) => void;
  onMerge: (category: Category) => void;
  onToggleArchive: (category: Category) => void;
  onRemove: (category: Category) => void;
};

function CategoryActions({ category, canMerge, onCreateSubcategory, onViewRules, onReorder, onEdit, onMerge, onToggleArchive, onRemove }: CategoryActionsProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ top: 0, right: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuHeight = 12 + (2 + (onViewRules ? 1 : 0) + (onReorder ? 1 : 0) + (canMerge ? 1 : 0) + (category.is_default ? 0 : 1)) * 40;

  const placeMenu = () => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setMenuPosition({
      top: rect.bottom + menuHeight + 8 > window.innerHeight
        ? Math.max(8, rect.top - menuHeight - 4)
        : rect.bottom + 4,
      right: Math.max(8, window.innerWidth - rect.right),
    });
  };

  useEffect(() => {
    if (!menuOpen) return;
    menuRef.current?.querySelector<HTMLButtonElement>('button[role="menuitem"]')?.focus();
    const onPointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)
        && !triggerRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("scroll", placeMenu, true);
    window.addEventListener("resize", placeMenu);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("scroll", placeMenu, true);
      window.removeEventListener("resize", placeMenu);
    };
  }, [menuOpen]);

  const onMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('button[role="menuitem"]') ?? []);
    const current = items.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      items[(current + (event.key === "ArrowDown" ? 1 : items.length - 1)) % items.length]?.focus();
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      items[event.key === "Home" ? 0 : items.length - 1]?.focus();
    }
  };

  return (
    <div className="flex max-w-full shrink-0 items-center justify-end gap-1.5 whitespace-nowrap">
      {onCreateSubcategory ? (
        <Button tone="secondary" className={cn(categoryActionClass, "relative !h-10 !w-10 after:absolute after:-inset-0.5 sm:!h-auto sm:!w-auto sm:after:hidden")}
          aria-label={`Crear subcategoría en ${category.name}`} onClick={() => onCreateSubcategory(category)}>
          <PlusIcon className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Subcategoría</span>
        </Button>
      ) : null}
      <button ref={triggerRef} type="button" aria-label={`Más acciones de ${category.name}`}
        aria-haspopup="menu" aria-expanded={menuOpen} aria-controls={menuOpen ? `category-actions-menu-${category.id}` : undefined}
        onClick={() => { placeMenu(); setMenuOpen(current => !current); }}
        className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-outline bg-white text-ink transition after:absolute after:-inset-0.5 hover:border-primary/40 hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary sm:after:hidden">
        <MoreVerticalIcon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
      </button>
      {menuOpen ? createPortal(
        <div ref={menuRef} id={`category-actions-menu-${category.id}`} role="menu"
          aria-label={`Acciones de ${category.name}`} onKeyDown={onMenuKeyDown} style={menuPosition}
          className="fixed z-50 min-w-48 rounded-xl border border-outline bg-white p-1.5 shadow-paper">
          {onViewRules ? (
            <button type="button" role="menuitem" onClick={() => {
              setMenuOpen(false);
              triggerRef.current?.focus({ preventScroll: true });
              onViewRules(category);
            }} className="block w-full rounded-lg px-3 py-2 text-left text-sm text-ink hover:bg-paper-soft">
              Ver reglas y propuestas
            </button>
          ) : null}
          {onReorder ? (
            <button type="button" role="menuitem" onClick={() => {
              setMenuOpen(false);
              triggerRef.current?.focus({ preventScroll: true });
              onReorder(category);
            }} className="block w-full rounded-lg px-3 py-2 text-left text-sm text-ink hover:bg-paper-soft">
              Ordenar subcategorías
            </button>
          ) : null}
          <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); onEdit(category); }}
            className="block w-full rounded-lg px-3 py-2 text-left text-sm text-ink hover:bg-paper-soft">
            Editar
          </button>
          {canMerge ? (
            <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); onMerge(category); }}
              className="block w-full rounded-lg px-3 py-2 text-left text-sm text-ink hover:bg-paper-soft">
              Fusionar
            </button>
          ) : null}
          <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); onToggleArchive(category); }}
            className="block w-full rounded-lg px-3 py-2 text-left text-sm text-ink hover:bg-paper-soft">
            {category.is_active ? "Archivar" : "Reactivar"}
          </button>
          {!category.is_default ? (
            <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); onRemove(category); }}
              className="block w-full rounded-lg px-3 py-2 text-left text-sm text-danger hover:bg-danger-soft">
              Eliminar
            </button>
          ) : null}
        </div>, document.body,
      ) : null}
    </div>
  );
}

function DragHandleDots() {
  return (
    <span aria-hidden="true" className="grid grid-cols-2 gap-[3px]">
      {Array.from({ length: 4 }, (_, index) => (
        <span key={index} className="h-1 w-1 rounded-full bg-current" />
      ))}
    </span>
  );
}

function emptyForm(parent?: Category): CategoryForm {
  return {
    id: null,
    name: "",
    type: parent?.type ?? CategoryType.EXPENSE,
    parent_id: parent ? String(parent.id) : "",
    sort_order: "0",
    icon: "",
    color: "",
    code: null,
  };
}

type CategoryFormModalProps = {
  error: string | null;
  form: CategoryForm;
  parentOptions: Category[];
  saving: boolean;
  onChange: (form: CategoryForm) => void;
  onClose: () => void;
  onSave: () => void;
};

function CategoryFormModal({
  error,
  form,
  parentOptions,
  saving,
  onChange,
  onClose,
  onSave,
}: CategoryFormModalProps) {
  const appearanceCategory = { code: form.code, parent_id: form.parent_id ? Number(form.parent_id) : null,
    icon: form.icon || null, color: form.color || null };
  const appearanceParents = createCategoryMap(parentOptions);
  const appearance = categoryAppearance(appearanceCategory, appearanceParents);
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !saving) onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [onClose, saving]);

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-ink/55 px-3 py-3 backdrop-blur-[2px] sm:px-4 sm:py-8"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !saving) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="category-form-title"
        className="max-h-[calc(100dvh-1.5rem)] w-full max-w-2xl overflow-y-auto rounded-[1.5rem] border border-outline bg-white p-4 sm:max-h-[calc(100dvh-4rem)] sm:p-6 md:p-8"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <p className="eyebrow m-0">
              {form.id ? "Editar categoria" : form.parent_id ? "Nueva subcategoria" : "Nueva categoria"}
            </p>
            <h2
              id="category-form-title"
              className="dialog-title"
            >
              {form.id ? "Actualizar organizacion" : "Agregar al catalogo"}
            </h2>
            <p className="max-w-xl text-sm text-muted sm:text-base">
              Define el nombre, tipo y nivel. La subcategoria es opcional y hereda el tipo de su categoria principal.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            aria-label="Cerrar formulario"
            className="rounded-full border border-outline bg-white px-3 py-2 text-sm text-muted transition hover:text-ink disabled:opacity-50"
          >
            Cerrar
          </button>
        </div>

        <form
          className="mt-5 grid min-w-0 gap-4 sm:mt-8 sm:gap-5 md:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            onSave();
          }}
        >
          <label className="space-y-2 md:col-span-2">
            <span className="text-sm font-medium">Nombre</span>
            <input
              autoFocus
              value={form.name}
              onChange={(event) => onChange({ ...form, name: event.target.value })}
              className="w-full rounded-2xl border border-outline bg-white px-4 py-3 outline-none transition focus:border-primary"
              placeholder="Ej: Restaurantes"
            />
          </label>

          <label className="space-y-2">
            <span className="text-sm font-medium">Tipo</span>
            <select
              value={form.type}
              onChange={(event) =>
                onChange({
                  ...form,
                  type: event.target.value as CategoryType,
                  parent_id: "",
                })
              }
              className="w-full rounded-2xl border border-outline bg-white px-4 py-3 outline-none transition focus:border-primary"
            >
              {Object.values(CategoryType).map((type) => (
                <option key={type} value={type}>{typeLabels[type]}</option>
              ))}
            </select>
          </label>

          <label className="space-y-2">
            <span className="text-sm font-medium">Orden</span>
            <input
              type="number"
              value={form.sort_order}
              onChange={(event) => onChange({ ...form, sort_order: event.target.value })}
              className="w-full rounded-2xl border border-outline bg-white px-4 py-3 outline-none transition focus:border-primary"
            />
          </label>

          <label className="space-y-2 md:col-span-2">
            <span className="text-sm font-medium">Categoria principal</span>
            <select
              value={form.parent_id}
              onChange={(event) => onChange({ ...form, parent_id: event.target.value })}
              className="w-full rounded-2xl border border-outline bg-white px-4 py-3 outline-none transition focus:border-primary"
            >
              <option value="">Ninguna: categoria principal</option>
              {parentOptions.map((category) => (
                <option key={category.id} value={category.id}>{category.name}</option>
              ))}
            </select>
          </label>

          <div className="space-y-4 md:col-span-2">
              <div className="flex flex-wrap items-center gap-3">
                <CategoryIcon category={appearanceCategory} categoryMap={appearanceParents} />
                <span className="min-w-0 break-words text-sm font-medium">{form.name || "Vista previa"}</span>
                <button type="button" className="ml-auto shrink-0 text-sm text-primary underline"
                  onClick={() => onChange({ ...form, icon: "", color: "" })}>Restablecer estilo</button>
              </div>
              <fieldset>
                <legend className="mb-2 text-sm font-medium">Icono</legend>
                <div className="grid grid-cols-5 gap-2 sm:grid-cols-7">
                  {Object.entries(CATEGORY_ICONS).map(([key, item]) => (
                    <button key={key} type="button" aria-label={`Icono: ${item.label}`} title={item.label}
                      aria-pressed={appearance.icon === key} onClick={() => onChange({ ...form, icon: key })}
                      className={cn("flex min-h-11 items-center justify-center rounded-xl border focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary",
                        appearance.icon === key ? "border-primary ring-1 ring-primary" : "border-outline")}>
                      <CategoryIcon category={{ ...appearanceCategory, icon: key }} categoryMap={appearanceParents} size="sm" />
                    </button>
                  ))}
                </div>
              </fieldset>
              <fieldset>
                <legend className="mb-2 text-sm font-medium">Color</legend>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(CATEGORY_COLORS).map(([key, item]) => (
                    <button key={key} type="button" aria-label={`Color: ${item.label}`} title={item.label}
                      aria-pressed={appearance.color === key} onClick={() => onChange({ ...form, color: key })}
                      className={cn("flex h-11 w-11 items-center justify-center rounded-full border-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary",
                        appearance.color === key ? "border-ink" : "border-transparent")}
                      style={{ backgroundColor: item.background, color: item.foreground }}>
                      <span aria-hidden="true" className="flex h-6 w-6 items-center justify-center rounded-full text-sm text-white" style={{ backgroundColor: item.foreground }}>
                        {appearance.color === key ? "✓" : ""}
                      </span>
                    </button>
                  ))}
                </div>
              </fieldset>
          </div>

          {error ? (
            <StatusNotice tone="error" className="md:col-span-2">{error}</StatusNotice>
          ) : null}

          <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end md:col-span-2">
            <Button type="button" tone="secondary" onClick={onClose} disabled={saving}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Guardando..." : form.id ? "Guardar cambios" : "Crear categoria"}
            </Button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}

function CategoryDeleteModal({ category, categories, saving, error, onClose, onDelete, onArchive }: {
  category: Category; categories: Category[]; saving: boolean; error: string | null;
  onClose: () => void; onDelete: (destination: string) => void; onArchive: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [destination, setDestination] = useState("");
  const categoryMap = createCategoryMap(categories);
  const children = categories.filter(item => item.parent_id === category.id);
  const inUse = category.transaction_count > 0 || category.rule_count > 0;
  const targets = categories.filter(item => item.id !== category.id && item.type === category.type && item.is_active);
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.current?.showModal();
    return () => { dialog.current?.close(); document.body.style.overflow = previous; };
  }, []);
  return createPortal(
    <dialog ref={dialog} aria-labelledby="delete-category-title"
      onCancel={event => { event.preventDefault(); if (!saving) onClose(); }}
      onClick={event => { if (event.target === event.currentTarget && !saving) onClose(); }}
      className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-2xl border border-outline bg-white p-6 text-ink shadow-xl backdrop:bg-black/35">
      <h2 id="delete-category-title" className="dialog-title">Eliminar {category.name}</h2>
      <p className="mt-3 text-sm text-muted">{category.transaction_count} movimientos · {category.rule_count} reglas · {children.length} subcategorías</p>
      <p className="mt-3 text-sm">Los movimientos nunca se eliminan al borrar una categoría.</p>
      {children.length ? (
        <p className="mt-4 rounded-xl bg-paper-soft p-3 text-sm">Primero mueve o elimina sus subcategorías, incluidas las archivadas. También puedes archivar la categoría completa para conservar su organización.</p>
      ) : (
        <div className="mt-4 space-y-3">
          <p className="text-sm text-muted">{inUse
            ? "Elige una categoría de destino. Sus movimientos, reglas y aprendizaje se trasladarán allí antes de eliminarla. Esto cambia su clasificación histórica."
            : "Puedes eliminarla directamente o trasladar su historial de correcciones a otra categoría."}</p>
          <label className="block space-y-2 text-sm font-medium">
            <span>Destino de los movimientos y reglas</span>
            <select value={destination} onChange={event => setDestination(event.target.value)} disabled={saving}
              className="w-full rounded-xl border border-outline bg-white px-3 py-3">
              <option value="">{inUse ? "Seleccionar categoría de destino" : "Eliminar sin trasladar (sin uso)"}</option>
              {targets.map(item => <option key={item.id} value={item.id}>{getCategoryPath(item.id, categoryMap)}</option>)}
            </select>
          </label>
          {inUse && !targets.length ? <p className="text-sm text-muted">Crea una categoría del mismo tipo o archiva esta para conservar sus movimientos clasificados.</p> : null}
        </div>
      )}
      <p className="mt-4 text-sm text-muted">Archivar conserva la categoría en el historial y la oculta para futuras asignaciones.</p>
      {error ? <StatusNotice tone="error" className="mt-4">{error}</StatusNotice> : null}
      <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
        <Button tone="secondary" disabled={saving} onClick={onClose}>Cancelar</Button>
        <Button tone="secondary" disabled={saving || !category.is_active} onClick={onArchive}>
          {category.is_active ? "Archivar en su lugar" : "Ya archivada"}
        </Button>
        {!children.length ? <Button disabled={saving || (inUse && !destination)} onClick={() => onDelete(destination)}>
          {saving ? "Guardando..." : destination ? "Trasladar y eliminar" : "Eliminar categoría"}
        </Button> : null}
      </div>
    </dialog>, document.body,
  );
}

function CategoryMergeModal({ category, categories, saving, error, onClose, onMerge }: {
  category: Category; categories: Category[]; saving: boolean; error: string | null;
  onClose: () => void; onMerge: (targetId: number) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [targetId, setTargetId] = useState("");
  const categoryMap = createCategoryMap(categories);
  const targets = categories.filter(item => item.id !== category.id && item.type === category.type && item.is_active);
  const hasChildren = categories.some(item => item.parent_id === category.id);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.current?.showModal();
    return () => { dialog.current?.close(); document.body.style.overflow = previous; };
  }, []);

  return createPortal(
    <dialog ref={dialog} aria-labelledby="merge-category-title"
      onCancel={event => { event.preventDefault(); if (!saving) onClose(); }}
      onClick={event => { if (event.target === event.currentTarget && !saving) onClose(); }}
      className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-2xl border border-outline bg-white p-6 text-ink shadow-xl backdrop:bg-black/35">
      <p className="eyebrow m-0">Organizar categorías</p>
      <h2 id="merge-category-title" className="dialog-title mt-1">Fusionar {category.name}</h2>
      <p className="mt-3 text-sm text-muted">Origen: {getCategoryPath(category.id, categoryMap)}</p>
      <p className="mt-1 text-sm text-muted">
        {category.transaction_count} {category.transaction_count === 1 ? "movimiento" : "movimientos"} · {category.rule_count} {category.rule_count === 1 ? "regla" : "reglas"}
      </p>
      <p className="mt-4 text-sm leading-6 text-muted">
        Los movimientos, reglas y correcciones pasarán al destino. La categoría de origen se eliminará y cambiará la clasificación de esos movimientos.
      </p>
      {category.is_default ? (
        <p className="mt-4 rounded-xl bg-paper-soft p-3 text-sm">Las categorías predeterminadas pueden archivarse, pero no fusionarse.</p>
      ) : hasChildren ? (
        <p className="mt-4 rounded-xl bg-paper-soft p-3 text-sm">Mueve o fusiona primero sus subcategorías.</p>
      ) : (
        <label className="mt-5 block space-y-2 text-sm font-medium">
          <span>Categoría de destino</span>
          <select autoFocus value={targetId} onChange={event => setTargetId(event.target.value)} disabled={saving}
            className="w-full rounded-xl border border-outline bg-white px-3 py-3">
            <option value="">Seleccionar destino</option>
            {targets.map(item => <option key={item.id} value={item.id}>{getCategoryPath(item.id, categoryMap)}</option>)}
          </select>
        </label>
      )}
      {!category.is_default && !hasChildren && !targets.length ? <p className="mt-3 text-sm text-muted">Crea primero una categoría activa del mismo tipo.</p> : null}
      {error ? <StatusNotice tone="error" className="mt-4">{error}</StatusNotice> : null}
      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button tone="secondary" disabled={saving} onClick={onClose}>Cancelar</Button>
        <Button disabled={saving || !targetId || hasChildren || category.is_default} onClick={() => onMerge(Number(targetId))}>
          {saving ? "Fusionando..." : "Fusionar categorías"}
        </Button>
      </div>
    </dialog>, document.body,
  );
}

export function CategoriesPage() {
  const writes = useWriteActions();
  const createRuleAction = useExplicitAction(writes.categories.createCategorizationRule);
  const updateRuleAction = useExplicitAction(writes.categories.updateCategorizationRule);
  const deleteRuleAction = useExplicitAction(writes.categories.deleteCategorizationRule);
  const previewRuleAction = useExplicitAction(CategoryService.previewCategorizationRule);
  const categoriesQuery = useCategories();
  const rulesQuery = useRules();
  const catalogQuery = useCategoryCatalog();
  const [orderPreview, setOrderPreview] = useState<Category[] | null>(null);
  const categories = orderPreview ?? categoriesQuery.data ?? emptyList;
  const rules = rulesQuery.data ?? emptyList;
  const loading = [categoriesQuery, rulesQuery, catalogQuery].some(query => query.isPending);
  const [saving, setSaving] = useState(false);
  const [actionError, setError] = useState<string | null>(null);
  const error = actionError ?? [categoriesQuery, rulesQuery, catalogQuery].find(query => query.error)?.error?.message ?? null;
  const [feedback, setFeedback] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [catalogSearch, setCatalogSearch] = useState("");
  const [catalogType, setCatalogType] = useState<CategoryType | "all">("all");
  const catalogSearchRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState<CategoryForm | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [compactDetails, setCompactDetails] = useState(() => window.matchMedia("(max-width: 1279px)").matches);
  const [detailsView, setDetailsView] = useState<CategoryDetailsView | null>(null);
  const [ruleKeyword, setRuleKeyword] = useState("");
  const [rulePriority, setRulePriority] = useState("100");
  const [ruleMatchType, setRuleMatchType] = useState<"exact" | "contains">("contains");
  const [rulePreview, setRulePreview] = useState<{ match_count: number; examples: string[] } | null>(null);
  const [editingRuleId, setEditingRuleId] = useState<number | null>(null);
  const [ruleFormOpen, setRuleFormOpen] = useState(false);
  const rulePreviewVersion = useRef(0);
  useEffect(() => { rulePreviewVersion.current++; setRulePreview(null); },
    [selectedCategoryId, ruleKeyword, rulePriority, ruleMatchType, ruleFormOpen]);
  const [ruleError, setRuleError] = useState<string | null>(null);
  const [ruleFeedback, setRuleFeedback] = useState<string | null>(null);
  const ruleInputRef = useRef<HTMLInputElement>(null);
  const newRuleButtonRef = useRef<HTMLButtonElement>(null);
  const catalogPreview = catalogQuery.data ?? emptyList;
  const [showCatalogPreview, setShowCatalogPreview] = useState(false);
  const [catalogNoticeDismissed, setCatalogNoticeDismissed] = useState(false);
  const [mergingCategory, setMergingCategory] = useState<Category | null>(null);
  const [mergeError, setMergeError] = useState<string | null>(null);
  const [merging, setMerging] = useState(false);
  const [deletingCategory, setDeletingCategory] = useState<Category | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [collapsedCategoryIds, setCollapsedCategoryIds] = useState<Set<number>>(
    () => new Set(),
  );
  const [draggedSubcategoryId, setDraggedSubcategoryId] = useState<number | null>(null);
  const [dragOverSubcategoryId, setDragOverSubcategoryId] = useState<number | null>(null);
  const [reorderingSubcategories, setReorderingSubcategories] = useState(false);
  const [orderingCategoryId, setOrderingCategoryId] = useState<number | null>(null);
  const orderingSiblingIds = useRef<number[]>([]);
  const CategoryLabel = compactDetails ? "div" : "button";

  useEffect(() => {
    setRuleFormOpen(false);
    setEditingRuleId(null);
    setRuleKeyword("");
    setRulePreview(null);
    setRulePriority("100");
    setRuleMatchType("contains");
    setRuleError(null);
    setRuleFeedback(null);
  }, [selectedCategoryId]);

  const closeRuleForm = () => {
    setRuleFormOpen(false);
    setEditingRuleId(null);
    setRuleKeyword("");
    setRulePreview(null);
    setRulePriority("100");
    setRuleMatchType("contains");
    setRuleError(null);
    window.requestAnimationFrame(() => newRuleButtonRef.current?.focus({ preventScroll: true }));
  };

  useEffect(() => {
    if (!categoriesQuery.isSuccess) return;
    setSelectedCategoryId(current => current !== null && categoriesQuery.data.some(item => item.id === current) ? current : null);
  }, [categoriesQuery.data, categoriesQuery.isSuccess]);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 1279px)");
    const syncLayout = () => {
      setCompactDetails(media.matches);
      setDetailsView(null);
    };
    media.addEventListener("change", syncLayout);
    return () => media.removeEventListener("change", syncLayout);
  }, []);

  const categoryMap = useMemo(() => createCategoryMap(categories), [categories]);
  const groups = useMemo(
    () =>
      groupCategories(
        categories.filter((category) => showArchived ? !category.is_active : category.is_active),
      ),
    [categories, showArchived],
  );
  const normalizedCatalogSearch = normalizeCatalogSearch(catalogSearch);
  const visibleGroups = useMemo(() => groups
    .filter(({ root }) => catalogType === "all" || root.type === catalogType)
    .flatMap(({ root, children }) => {
      if (!normalizedCatalogSearch || normalizeCatalogSearch(getCategoryPath(root.id, categoryMap)).includes(normalizedCatalogSearch)) {
        return [{ root, children }];
      }
      const matchingChildren = children.filter(child => normalizeCatalogSearch(child.name).includes(normalizedCatalogSearch));
      return matchingChildren.length ? [{ root, children: matchingChildren }] : [];
    }), [groups, catalogType, normalizedCatalogSearch, categoryMap]);
  const visibleCategoryCount = visibleGroups.reduce((count, group) => count + 1 + group.children.length, 0);
  const catalogFiltered = Boolean(normalizedCatalogSearch) || catalogType !== "all";
  const clearCatalogFilters = () => {
    setCatalogSearch("");
    setCatalogType("all");
    catalogSearchRef.current?.focus();
  };
  const selectedCategory = selectedCategoryId
    ? categoryMap.get(selectedCategoryId) ?? null
    : null;
  const selectedRules = rules.filter((rule) => rule.category_id === selectedCategoryId);
  const orderingGroup = groups.find(group => group.root.id === orderingCategoryId);
  const activeCount = categories.filter((category) => category.is_active).length;
  const rootCount = categories.filter(
    (category) => category.is_active && category.parent_id === null,
  ).length;
  const subcategoryCount = categories.filter(
    (category) => category.is_active && category.parent_id !== null,
  ).length;

  const parentOptions = categories.filter(
    (category) =>
      category.parent_id === null &&
      category.is_active &&
      category.type === form?.type &&
      category.id !== form?.id,
  );
  const editCategory = (category: Category) => {
    setForm({
      id: category.id,
      name: category.name,
      type: category.type,
      parent_id: category.parent_id ? String(category.parent_id) : "",
      sort_order: String(category.sort_order),
      icon: category.icon ?? "",
      color: category.color ?? "",
      code: category.code,
    });
    setError(null);
    setFeedback(null);
  };

  const openCreateCategory = (parent?: Category) => {
    setForm(emptyForm(parent));
    setError(null);
    setFeedback(null);
  };

  const closeCategoryForm = () => {
    if (saving) return;
    setForm(null);
    setError(null);
  };

  const toggleCategoryCollapse = (categoryId: number) => {
    setCollapsedCategoryIds((current) => {
      const next = new Set(current);
      if (next.has(categoryId)) next.delete(categoryId);
      else next.add(categoryId);
      return next;
    });
  };

  const toggleCategorySelection = (categoryId: number) => {
    setSelectedCategoryId((current) => compactDetails ? categoryId : current === categoryId ? null : categoryId);
    setRuleKeyword("");
    setEditingRuleId(null);
    setRulePreview(null);
    setDetailsView("rules");
  };

  const reorderSubcategory = async (
    parentId: number,
    sourceId: number | null,
    targetId: number,
  ) => {
    setDraggedSubcategoryId(null);
    setDragOverSubcategoryId(null);
    if (!sourceId || sourceId === targetId || reorderingSubcategories) return;

    const siblings = categories
      .filter((category) => category.parent_id === parentId)
      .sort(
        (left, right) =>
          left.sort_order - right.sort_order || left.name.localeCompare(right.name, "es"),
      );
    const sourceIndex = siblings.findIndex((category) => category.id === sourceId);
    const targetIndex = siblings.findIndex((category) => category.id === targetId);
    if (sourceIndex === -1 || targetIndex === -1) return;

    const reordered = [...siblings];
    const [moved] = reordered.splice(sourceIndex, 1);
    reordered.splice(targetIndex, 0, moved);
    await persistSubcategoryOrder(reordered);
  };

  const persistSubcategoryOrder = async (reordered: Category[]) => {
    const orderById = new Map(
      reordered.map((category, index) => [category.id, (index + 1) * 10]),
    );

    setOrderPreview(
      categories.map((category) => {
        const sortOrder = orderById.get(category.id);
        return sortOrder === undefined ? category : { ...category, sort_order: sortOrder };
      }),
    );
    setReorderingSubcategories(true);
    setError(null);
    setFeedback(null);

    try {
      const results = await Promise.allSettled(
        reordered.map((category, index) =>
          writes.categories.updateCategory(category.id, { sort_order: (index + 1) * 10 }),
        ),
      );
      if (results.some((result) => result.status === "rejected")) {
        throw new Error("No fue posible guardar todo el nuevo orden.");
      }
      setFeedback("Orden de subcategorias guardado.");
      return true;
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "No fue posible guardar el orden de las subcategorias.",
      );
      return false;
    } finally {
      setOrderPreview(null);
      setReorderingSubcategories(false);
    }
  };

  const saveSubcategoryOrder = async (ids: number[]) => {
    if (!orderingGroup || reorderingSubcategories) return;
    const visibleIds = new Set(orderingGroup.children.map(category => category.id));
    if (ids.length !== visibleIds.size || new Set(ids).size !== ids.length || ids.some(id => !visibleIds.has(id))) return;
    const siblings = orderingSiblingIds.current.map(id => categoryMap.get(id)!);
    let nextIndex = 0;
    // Retain the original slots of hidden categories, including after a partial-save retry.
    const reordered = siblings.map(category => visibleIds.has(category.id) ? categoryMap.get(ids[nextIndex++])! : category);
    if (await persistSubcategoryOrder(reordered)) setOrderingCategoryId(null);
  };

  const saveCategory = async () => {
    if (!form?.name.trim()) {
      setError("Escribe un nombre para la categoria.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        name: form.name.trim(),
        type: form.type,
        parent_id: form.parent_id ? Number(form.parent_id) : null,
        sort_order: Number(form.sort_order) || 0,
        icon: form.icon || null,
        color: form.color || null,
      };
      if (form.id) {
        await writes.categories.updateCategory(form.id, payload);
        setFeedback("Categoria actualizada correctamente.");
      } else {
        await writes.categories.createCategory({
          ...payload,
          is_default: false,
          is_active: true,
        });
        setFeedback("Categoria creada correctamente.");
      }
      setForm(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No fue posible guardar la categoria.");
    } finally {
      setSaving(false);
    }
  };

  const toggleArchive = async (category: Category) => {
    const action = category.is_active ? "archivar" : "reactivar";
    if (!window.confirm(`¿Quieres ${action} ${category.name}?`)) return;
    try {
      await writes.categories.updateCategory(category.id, { is_active: !category.is_active });
      setFeedback(
        category.is_active
          ? "Categoria archivada; su historial permanece intacto."
          : "Categoria reactivada.",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : `No fue posible ${action} la categoria.`);
    }
  };

  const removeCategory = (category: Category) => {
    setDeleteError(null);
    setError(null);
    setDeletingCategory(category);
  };

  const confirmCategoryRemoval = async (destination: string, archive = false) => {
    if (!deletingCategory || deleting) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      if (archive) {
        await writes.categories.updateCategory(deletingCategory.id, { is_active: false });
        setFeedback("Categoría archivada; su historial permanece intacto.");
      } else if (destination) {
        await writes.categories.mergeCategory(deletingCategory.id, Number(destination));
        setSelectedCategoryId(Number(destination));
        setFeedback("Categoría eliminada. Sus movimientos, reglas y aprendizaje se trasladaron al destino.");
      } else {
        await writes.categories.deleteCategory(deletingCategory.id);
        setFeedback("Categoría sin uso eliminada.");
      }
      setDeletingCategory(null);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "No fue posible eliminar la categoría.");
    } finally {
      setDeleting(false);
    }
  };

  const parsedRulePriority = rulePriority.trim() === "" ? 100 : Number(rulePriority);
  const validRulePriority = Number.isSafeInteger(parsedRulePriority);
  const createRule = async () => {
    if (!selectedCategory || !ruleKeyword.trim() || !validRulePriority) return;
    try {
      const payload = {
        keyword: ruleKeyword.trim(), category_id: selectedCategory.id,
        priority: parsedRulePriority, match_type: ruleMatchType,
      };
      if (editingRuleId) await updateRuleAction.run(editingRuleId, payload);
      else await createRuleAction.run(payload);
      closeRuleForm();
      setRuleFeedback(editingRuleId ? "Regla actualizada correctamente." : "Regla creada correctamente.");
    } catch (err) {
      setRuleError(err instanceof Error ? err.message : "No fue posible crear la regla.");
    }
  };

  const previewRule = async () => {
    if (!selectedCategory || !ruleKeyword.trim() || !validRulePriority) return;
    const version = rulePreviewVersion.current;
    try {
      const result = await previewRuleAction.run({
        keyword: ruleKeyword.trim(), category_id: selectedCategory.id,
        priority: parsedRulePriority, match_type: ruleMatchType,
      });
      if (version !== rulePreviewVersion.current) return;
      setRulePreview(result);
      setRuleError(null);
    } catch (err) {
      if (version !== rulePreviewVersion.current) return;
      setRuleError(err instanceof Error ? err.message : "No fue posible revisar la regla.");
    }
  };

  const removeRule = async (ruleId: number) => {
    try {
      await deleteRuleAction.run(ruleId);
      setRuleFeedback("Regla eliminada.");
    } catch (err) {
      setRuleError(err instanceof Error ? err.message : "No fue posible eliminar la regla.");
    }
  };

  const mergeSelectedCategory = async (targetId: number) => {
    if (!mergingCategory || merging) return;
    setMerging(true);
    setMergeError(null);
    try {
      await writes.categories.mergeCategory(mergingCategory.id, targetId);
      setSelectedCategoryId(targetId);
      setMergingCategory(null);
      setFeedback("Categorías fusionadas. Los movimientos y reglas se trasladaron al destino.");
    } catch (err) {
      setMergeError(err instanceof Error ? err.message : "No fue posible fusionar las categorías.");
    } finally {
      setMerging(false);
    }
  };

  return (
    <div className="space-y-5 sm:space-y-8">
      <PageIntro
        compactOnMobile
        title="Categorías"
        description="Ordena tus movimientos en dos niveles y administra las reglas que los clasifican automaticamente."
        actions={
          <Button className="w-full sm:w-auto" onClick={() => openCreateCategory()}>
            <PlusIcon className="h-5 w-5" />
            Nueva categoria
          </Button>
        }
      />

      {feedback ? <StatusNotice tone="success">{feedback}</StatusNotice> : null}
      {error && !form ? <ErrorState message={error} /> : null}
      {loading ? <LoadingState message="Cargando categorias..." /> : null}

      {!loading && !catalogNoticeDismissed && catalogPreview.some(item => item.status === "skipped") ? (
        <aside aria-label="Información del catálogo" className="rounded-xl border border-outline/60 bg-white/60 px-3 py-1 text-sm">
          <div className="flex items-center justify-between gap-3">
            <button type="button" aria-expanded={showCatalogPreview} aria-controls="catalog-preserved-details"
              className="flex min-h-11 items-center gap-2 text-left text-muted hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary" onClick={() => setShowCatalogPreview(current => !current)}>
              <ChevronDownIcon className={cn("h-4 w-4 shrink-0 transition", showCatalogPreview && "rotate-180")} />Sobre tus categorías
            </button>
            <button type="button" aria-label="Descartar aviso del catálogo" onClick={() => setCatalogNoticeDismissed(true)}
              className="min-h-11 shrink-0 rounded-lg px-2 text-muted underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">Descartar</button>
          </div>
          {showCatalogPreview ? (
            <div id="catalog-preserved-details" className="max-h-64 space-y-2 overflow-auto border-t border-outline/60 py-3 text-muted">
              <p>Tus categorías personalizadas y archivadas se mantienen. Estas no se agregaron de nuevo para respetar tu organización:</p>
              {catalogPreview.filter(item => item.status === "skipped").map(item => (
                <p key={item.code} className="py-1">
                  {item.name}
                  {item.reason ? ` — ${item.reason}` : ""}
                </p>
              ))}
            </div>
          ) : null}
        </aside>
      ) : null}

      <section id="category-catalog" aria-label="Explorar categorías" className="scroll-mt-24 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 sm:gap-4">
        <div className="flex items-center gap-3">
          <h2 className="section-title">Catálogo</h2>
          <button type="button" className="min-h-11 rounded-xl border border-outline bg-white px-3 text-sm font-medium text-primary"
            onClick={() => { setSelectedCategoryId(null); setDetailsView("proposals"); }}>
            Propuestas
          </button>
        </div>
        <div className="flex items-center gap-4">
          {reorderingSubcategories ? (
            <span role="status" className="text-sm font-medium text-primary">
              Guardando orden...
            </span>
          ) : null}
          <label className="flex min-h-11 items-center gap-2 text-sm text-muted">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(event) => setShowArchived(event.target.checked)}
              className="h-4 w-4 accent-primary"
            />
            Solo archivadas
          </label>
        </div>
      </div>
      {!loading ? <>
        <dl aria-label="Resumen de categorías" className="flex flex-wrap gap-x-5 gap-y-1 text-sm leading-6 text-muted">
          {[["Activas", activeCount], ["Principales", rootCount], ["Subcategorías", subcategoryCount]].map(([label, value]) => (
            <div key={label} className="flex items-baseline gap-1.5">
              <dt className="order-2">{label}</dt><dd className="font-semibold tabular-nums text-ink">{value}</dd>
            </div>
          ))}
        </dl>
        <div className="flex min-w-0 flex-col gap-3 xl:flex-row xl:items-center">
          <input ref={catalogSearchRef} type="search" aria-label="Buscar categorías y subcategorías" placeholder="Buscar categorías y subcategorías"
            value={catalogSearch} onChange={event => setCatalogSearch(event.target.value)}
            className="min-h-11 w-full min-w-0 rounded-xl border border-outline bg-white px-3 py-2 text-base outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15 xl:max-w-md" />
          <div role="group" aria-label="Filtrar categorías por tipo" className="flex min-w-0 gap-1 sm:gap-2">
            {([["all", "Todas"], [CategoryType.EXPENSE, "Gastos"], [CategoryType.INCOME, "Ingresos"], [CategoryType.TRANSFER, "Transferencias"]] as const).map(([value, label]) => (
              <button key={value} type="button" aria-pressed={catalogType === value} onClick={() => setCatalogType(value)}
                className={cn("min-h-11 flex-1 whitespace-nowrap rounded-lg border px-2 py-2 text-xs transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:flex-none sm:rounded-xl sm:px-3 sm:text-sm", catalogType === value ? "border-primary/30 bg-primary-mist font-semibold text-primary" : "border-outline bg-white text-muted hover:bg-paper-soft")}>
                {label}
              </button>
            ))}
          </div>
        </div>
        {catalogFiltered ? <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <p role="status" className="text-muted">{visibleCategoryCount === 0 ? "Sin resultados" : `${visibleCategoryCount} ${visibleCategoryCount === 1 ? "categoría visible" : "categorías visibles"}${normalizedCatalogSearch ? " · Incluye su grupo principal" : ""}`}</p>
          <button type="button" onClick={clearCatalogFilters} className="min-h-11 rounded-lg px-2 text-primary underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">Limpiar filtros</button>
        </div> : null}
      </> : null}
      </section>

      {!loading ? (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(340px,0.65fr)]">
          <div className="min-w-0 space-y-4">
            {visibleGroups.length === 0 && catalogFiltered ? <EmptyState title="No hay categorías que coincidan"
              description={showArchived ? "Prueba otro nombre o tipo, o desactiva «Solo archivadas» para ver las activas." : "Prueba otro nombre o tipo. Activa «Solo archivadas» si buscas una categoría archivada."} /> : groups.length === 0 ? <EmptyState title={showArchived ? "No hay categorías archivadas" : "No hay categorias"}
              description={showArchived ? "Las categorías que archives aparecerán aquí. Desactiva «Solo archivadas» para volver a las activas." : "Crea la primera categoria para comenzar a organizar tus movimientos."} /> : null}
            {visibleGroups.map(({ root, children }) => {
              const isCollapsed = !normalizedCatalogSearch && collapsedCategoryIds.has(root.id);
              const isRootSelected = !compactDetails && selectedCategoryId === root.id;
              return (
                <Panel
                  key={root.id}
                  className={cn(
                    "relative overflow-hidden !p-3.5 transition-colors sm:!p-6 md:!p-8",
                    isRootSelected &&
                      "border-primary/55 bg-primary-mist/35 ring-1 ring-primary/10",
                    !root.is_active && "opacity-60",
                  )}
                >
                  {isRootSelected ? (
                    <span
                      aria-hidden="true"
                      className="absolute inset-y-0 left-0 w-1.5 bg-primary"
                    />
                  ) : null}
                  <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2 sm:flex sm:justify-between sm:gap-4">
                    <div className="flex min-w-0 flex-1 items-start gap-1.5 sm:gap-3">
                      {children.length > 0 && !normalizedCatalogSearch ? (
                        <button
                          type="button"
                          onClick={() => toggleCategoryCollapse(root.id)}
                          aria-expanded={!isCollapsed}
                          aria-controls={`subcategory-list-${root.id}`}
                          aria-label={
                            isCollapsed
                              ? `Mostrar subcategorias de ${root.name}`
                              : `Ocultar subcategorias de ${root.name}`
                          }
                          title={isCollapsed ? "Mostrar subcategorias" : "Ocultar subcategorias"}
                          className="mt-0.5 flex h-11 w-8 shrink-0 items-center justify-center rounded-full text-muted transition hover:border-primary/40 hover:text-primary sm:h-10 sm:w-10 sm:border sm:border-outline sm:bg-white"
                        >
                          <ChevronDownIcon
                            className={cn(
                              "h-5 w-5 transition-transform duration-200",
                              isCollapsed && "-rotate-90",
                            )}
                          />
                        </button>
                      ) : (
                        <span aria-hidden="true" className="mt-0.5 h-11 w-8 shrink-0 sm:h-10 sm:w-10" />
                      )}
                      <CategoryLabel
                        {...(!compactDetails ? { type: "button" as const, onClick: () => toggleCategorySelection(root.id), "aria-pressed": isRootSelected } : {})}
                        className="min-w-0 text-left"
                      >
                        <div className="flex min-w-0 items-start gap-2 sm:gap-3">
                          <CategoryIcon category={root} compactOnMobile />
                          <div className="min-w-0">
                            {root.parent_id !== null && categoryMap.has(root.parent_id) ? <p className="mb-1 text-xs text-muted [overflow-wrap:anywhere]">{categoryMap.get(root.parent_id)?.name}</p> : null}
                            <h3 className="text-base font-medium leading-tight [overflow-wrap:anywhere] sm:text-xl">{root.name}</h3>
                            <div className="mt-2 flex flex-wrap items-center gap-1.5 sm:gap-2">
                              <span className={cn("rounded-full px-3 py-1 text-xs font-semibold", typeBadgeClasses[root.type])}>
                                {typeLabels[root.type]}
                              </span>
                              {isRootSelected ? (
                                <span className="hidden rounded-full bg-primary px-3 py-1 text-xs font-semibold text-white sm:inline-flex">
                                  Seleccionada
                                </span>
                              ) : null}
                              {!root.is_active ? <span className="text-xs text-danger">Archivada</span> : null}
                            </div>
                          </div>
                        </div>
                        <p className="mt-2 text-xs leading-5 text-muted sm:text-sm">
                          {root.transaction_count} movimientos · {root.rule_count} reglas
                        </p>
                      </CategoryLabel>
                    </div>
                    <div className="justify-self-end sm:contents">
                      <CategoryActions category={root} canMerge={canMergeCategory(root, categories)}
                        onViewRules={compactDetails ? category => toggleCategorySelection(category.id) : undefined}
                        onReorder={(groups.find(group => group.root.id === root.id)?.children.length ?? 0) > 1 ? category => {
                          orderingSiblingIds.current = categories.filter(item => item.parent_id === category.id)
                            .sort((left, right) => left.sort_order - right.sort_order || left.name.localeCompare(right.name, "es"))
                            .map(item => item.id);
                          setError(null); setFeedback(null); setOrderingCategoryId(category.id);
                        } : undefined}
                        onCreateSubcategory={root.parent_id === null && root.is_active ? openCreateCategory : undefined} onEdit={editCategory}
                        onMerge={(category) => { setMergeError(null); setMergingCategory(category); }}
                        onToggleArchive={(category) => void toggleArchive(category)}
                        onRemove={removeCategory} />
                    </div>
                  </div>

                  {children.length > 0 && !isCollapsed ? (
                    <div
                      id={`subcategory-list-${root.id}`}
                      className="mt-4 space-y-2 border-l-2 border-primary/15 pl-2 sm:mt-5 sm:pl-4"
                    >
                    {children.map((child) => (
                      <div
                        key={child.id}
                        onDragOver={(event) => {
                          const draggedCategory = draggedSubcategoryId
                            ? categoryMap.get(draggedSubcategoryId)
                            : null;
                          if (draggedCategory?.parent_id !== root.id) return;
                          event.preventDefault();
                          event.dataTransfer.dropEffect = "move";
                          setDragOverSubcategoryId(child.id);
                        }}
                        onDrop={(event) => {
                          event.preventDefault();
                          const transferredId = Number(event.dataTransfer.getData("text/plain"));
                          void reorderSubcategory(
                            root.id,
                            transferredId || draggedSubcategoryId,
                            child.id,
                          );
                        }}
                        className={cn(
                          "relative flex items-center justify-between gap-2 overflow-hidden rounded-2xl border border-outline/70 bg-paper-soft/60 p-2.5 transition sm:items-start sm:gap-3 sm:p-4",
                          !compactDetails && selectedCategoryId === child.id &&
                            "border-primary/55 bg-primary-mist/55 ring-1 ring-primary/10",
                          !child.is_active && "opacity-60",
                          draggedSubcategoryId === child.id && "opacity-45",
                          dragOverSubcategoryId === child.id &&
                            draggedSubcategoryId !== child.id &&
                            "border-primary/50 bg-primary-mist/50",
                        )}
                      >
                        {!compactDetails && selectedCategoryId === child.id ? (
                          <span
                            aria-hidden="true"
                            className="absolute inset-y-0 left-0 w-1 bg-primary"
                          />
                        ) : null}
                        <div className="flex min-w-0 flex-1 items-center gap-1.5 sm:gap-3">
                          {!compactDetails ? <button
                            type="button"
                            draggable={!reorderingSubcategories}
                            disabled={reorderingSubcategories}
                            aria-label={`Mover ${child.name}`}
                            title="Arrastrar para ordenar"
                            onDragStart={(event) => {
                              event.dataTransfer.effectAllowed = "move";
                              event.dataTransfer.setData("text/plain", String(child.id));
                              setDraggedSubcategoryId(child.id);
                              setDragOverSubcategoryId(child.id);
                            }}
                            onDragEnd={() => {
                              setDraggedSubcategoryId(null);
                              setDragOverSubcategoryId(null);
                            }}
                            className="flex h-11 w-6 shrink-0 cursor-grab items-center justify-center rounded-xl text-muted transition hover:border-primary/40 hover:text-primary active:cursor-grabbing disabled:cursor-wait disabled:opacity-50 sm:h-9 sm:w-9 sm:border sm:border-outline sm:bg-white"
                          >
                            <DragHandleDots />
                          </button> : null}
                          <CategoryLabel
                            {...(!compactDetails ? { type: "button" as const, onClick: () => toggleCategorySelection(child.id), "aria-pressed": selectedCategoryId === child.id } : {})}
                            className="min-w-0 text-left"
                          >
                            <div className="flex items-center gap-2 sm:flex-wrap">
                              <CategoryIcon category={child} categoryMap={categoryMap} size="sm" compactOnMobile />
                              <p className="min-w-0 text-sm font-medium [overflow-wrap:anywhere] sm:truncate sm:text-base">{child.name}</p>
                              {!compactDetails && selectedCategoryId === child.id ? (
                                <span className="hidden rounded-full bg-primary px-2.5 py-1 text-xs font-semibold text-white sm:inline-flex">
                                  Seleccionada
                                </span>
                              ) : null}
                            </div>
                            <p className="mt-1 text-xs leading-5 text-muted sm:text-sm">
                              {child.transaction_count} movimientos · {child.rule_count} reglas
                            </p>
                          </CategoryLabel>
                        </div>
                        <CategoryActions category={child} canMerge={canMergeCategory(child, categories)} onEdit={editCategory}
                          onViewRules={compactDetails ? category => toggleCategorySelection(category.id) : undefined}
                          onMerge={(category) => { setMergeError(null); setMergingCategory(category); }}
                          onToggleArchive={(category) => void toggleArchive(category)}
                          onRemove={removeCategory} />
                      </div>
                    ))}
                    </div>
                  ) : null}
                </Panel>
              );
            })}
          </div>

          <CategoryDetailsPanel compact={compactDetails} open={detailsView !== null}
            view={detailsView ?? "rules"} onViewChange={setDetailsView} onClose={() => setDetailsView(null)}
            categoryName={selectedCategory ? getCategoryPath(selectedCategory.id, categoryMap) : undefined}
            categoryBadge={selectedCategory ? <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", typeBadgeClasses[selectedCategory.type])}>{typeLabels[selectedCategory.type]}</span> : null}
            rules={
            <Panel className={compactDetails ? "!p-4 sm:!p-6 md:!p-8" : "!rounded-none !border-0 !p-4 !shadow-none"}>
              <h2 className={compactDetails ? "text-xl font-medium sm:text-2xl" : "sr-only"}>Reglas automaticas</h2>
              {ruleError ? <StatusNotice tone="error" className="mt-3">{ruleError}</StatusNotice> : null}
              {ruleFeedback ? <StatusNotice tone="success" className="mt-3">{ruleFeedback}</StatusNotice> : null}
              {selectedCategory ? (
                <>
                  {compactDetails ? <div className="mt-4 rounded-2xl border border-primary/20 bg-primary-mist/55 px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary/75">
                          Categoria seleccionada
                        </p>
                        <p className="mt-1 font-semibold text-ink">
                          {getCategoryPath(selectedCategory.id, categoryMap)}
                        </p>
                      </div>
                      <span
                        className={cn(
                          "rounded-full px-2.5 py-1 text-xs font-semibold",
                          typeBadgeClasses[selectedCategory.type],
                        )}
                      >
                        {typeLabels[selectedCategory.type]}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-muted">
                      Las nuevas reglas se asignaran a esta categoria.
                    </p>
                  </div> : <div className="flex items-center justify-between gap-3">
                    <p className="text-sm text-muted">{selectedRules.length} {selectedRules.length === 1 ? "regla" : "reglas"}</p>
                    <button ref={newRuleButtonRef} type="button" disabled={!selectedCategory.is_active} aria-expanded={ruleFormOpen}
                      aria-controls="category-rule-editor" onClick={() => {
                        setRuleKeyword(""); setEditingRuleId(null); setRulePriority("100"); setRuleMatchType("contains");
                        setRulePreview(null); setRuleError(null); setRuleFeedback(null); setRuleFormOpen(true);
                        window.requestAnimationFrame(() => ruleInputRef.current?.focus());
                      }} className="flex min-h-11 items-center gap-1.5 rounded-xl border border-outline px-3 text-sm font-medium text-primary hover:bg-primary-mist disabled:opacity-50">
                      <PlusIcon className="h-4 w-4" />Nueva regla
                    </button>
                  </div>}
                  {compactDetails || ruleFormOpen ? <div id="category-rule-editor" role="region" aria-label={editingRuleId ? "Editar regla" : "Nueva regla"}
                    className={cn("mt-4 space-y-3", !compactDetails && "rounded-xl border border-outline bg-paper/50 p-3")}>
                    {!compactDetails && <p className="text-sm font-semibold">{editingRuleId ? "Editar regla" : "Nueva regla"}</p>}
                    <input
                      ref={ruleInputRef}
                      aria-label="Palabra o comercio"
                      value={ruleKeyword}
                      onChange={(event) => setRuleKeyword(event.target.value)}
                      placeholder="Palabra o comercio"
                      disabled={!selectedCategory.is_active}
                      className="w-full rounded-2xl border border-outline bg-white px-4 py-3"
                    />
                    <p className="text-xs leading-5 text-muted">{ruleMatchType === "contains" ? "Se aplicará cuando la descripción contenga esta palabra o frase." : "Se aplicará cuando coincida toda la descripción."}</p>
                    <details key={`${selectedCategory.id}-${editingRuleId ?? "new"}`} className="rounded-xl border border-outline/70 bg-white px-3">
                      <summary className="cursor-pointer py-3 text-sm font-medium text-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
                        Opciones avanzadas
                        {(ruleMatchType !== "contains" || parsedRulePriority !== 100) && <span className="mt-1 block text-xs font-normal">{ruleMatchType === "exact" ? "Coincidencia exacta" : "Contiene"} · Prioridad {rulePriority || "100"}</span>}
                      </summary>
                      <div className="space-y-4 border-t border-outline/60 pb-3 pt-3">
                        <label className="block space-y-2 text-sm">
                          <span className="font-medium">Tipo de coincidencia</span>
                          <select aria-describedby="rule-match-help" value={ruleMatchType}
                            onChange={event => { setRuleMatchType(event.target.value as "exact" | "contains"); setRulePreview(null); }}
                            className="min-h-11 w-full rounded-xl border border-outline bg-white px-3 py-2">
                            <option value="contains">Contiene</option><option value="exact">Exacta</option>
                          </select>
                        </label>
                        <p id="rule-match-help" className="text-xs leading-5 text-muted">«Contiene» busca la palabra o frase dentro de la descripción. «Exacta» exige que coincida la descripción completa.</p>
                        <label className="block space-y-2 text-sm">
                          <span className="font-medium">Prioridad</span>
                          <input type="number" step="1" value={rulePriority} aria-describedby="rule-priority-help" aria-invalid={!validRulePriority}
                            onChange={event => { setRulePriority(event.target.value); setRulePreview(null); }}
                            placeholder="100" className="min-h-11 w-full rounded-xl border border-outline bg-white px-3 py-2" />
                        </label>
                        <p id="rule-priority-help" className="text-xs leading-5 text-muted">Usa 100 normalmente. Si coinciden varias reglas tuyas, se evalúa primero la de mayor número.</p>
                        {!validRulePriority && <p role="alert" className="text-xs text-danger">Escribe un número entero.</p>}
                      </div>
                    </details>
                      <Button
                        className="w-full min-w-0"
                        disabled={createRuleAction.isPending || updateRuleAction.isPending || !ruleKeyword.trim() || !selectedCategory.is_active || !validRulePriority}
                        onClick={() => void createRule()}
                      >
                        {editingRuleId ? "Guardar regla" : "Agregar regla"}
                      </Button>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                      {editingRuleId || !compactDetails ? <button type="button" className="min-h-11 text-sm text-muted underline"
                        onClick={closeRuleForm}>
                        {editingRuleId ? "Cancelar edición" : "Cancelar"}
                      </button> : null}
                      <button type="button" className="min-h-11 text-sm text-primary underline" disabled={previewRuleAction.isPending || !ruleKeyword.trim() || !validRulePriority}
                        onClick={() => void previewRule()}>Vista previa de coincidencias</button>
                    </div>
                    {rulePreview ? <p className="text-sm text-muted">
                      {rulePreview.match_count} movimientos existentes coinciden. Las categorías actuales no cambiarán.
                      {rulePreview.examples.length > 0 ? ` Ejemplos: ${rulePreview.examples.slice(0, 3).join("; ")}.` : ""}
                    </p> : null}
                  </div> : null}
                  <div className="mt-5 max-h-[23.5rem] space-y-2 overflow-y-auto overscroll-contain pr-1 xl:max-h-none xl:overflow-visible">
                    {selectedRules.map((rule) => (
                      <div key={rule.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-paper-soft px-3 py-2 sm:flex-nowrap xl:flex-wrap xl:justify-start xl:gap-x-4 xl:gap-y-1">
                        <div className="min-w-0 basis-full sm:basis-auto xl:basis-full">
                          <p className="break-words font-medium">{rule.keyword}</p>
                          <p className="text-sm text-muted">
                            {rule.match_type === "exact" ? "Exacta" : "Contiene"} · {rule.origin === "system" ? "Predeterminada" : rule.origin === "accepted" ? "Aceptada" : rule.origin === "legacy" ? "Anterior" : "Personal"} · Prioridad {rule.priority}
                          </p>
                        </div>
                        <button type="button" className="min-h-11 text-xs text-primary underline sm:min-h-0"
                          onClick={() => void writes.categories.updateCategorizationRule(rule.id, { is_active: !rule.is_active }).catch(err => setRuleError(err.message))}>
                          {rule.is_active ? "Pausar" : "Activar"}
                        </button>
                        <button type="button" className="min-h-11 text-xs text-primary underline sm:min-h-0"
                          onClick={() => {
                            setEditingRuleId(rule.id); setRuleKeyword(rule.keyword);
                            setRulePriority(String(rule.priority)); setRuleMatchType(rule.match_type);
                            setRulePreview(null); setRuleFormOpen(true); setRuleError(null); setRuleFeedback(null);
                            window.requestAnimationFrame(() => ruleInputRef.current?.focus());
                          }}>Editar</button>
                        <button
                          type="button"
                          onClick={() => void removeRule(rule.id)}
                          aria-label={`Eliminar regla ${rule.keyword}`}
                          className="flex h-11 w-11 items-center justify-center rounded-full p-2 text-muted hover:bg-danger-soft hover:text-danger sm:h-auto sm:w-auto"
                        >
                          <TrashIcon className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                    {selectedRules.length === 0 ? (
                      <p className="py-4 text-center text-sm text-muted">Sin reglas asociadas.</p>
                    ) : null}
                  </div>
                </>
              ) : (
                <p className="mt-3 text-sm text-muted">Selecciona una categoria.</p>
              )}
            </Panel>

          }
            proposals={<CategoryLearning categories={categories}
              embedded={!compactDetails} categoryId={selectedCategoryId} />}
          />
        </div>
      ) : null}

      {orderingGroup ? <SubcategoryOrderModal key={orderingGroup.root.id} parent={orderingGroup.root}
        items={orderingGroup.children} categoryMap={categoryMap} saving={reorderingSubcategories} error={error}
        onSave={ids => void saveSubcategoryOrder(ids)} onClose={() => { if (!reorderingSubcategories) { setOrderingCategoryId(null); setError(null); } }} /> : null}

      {deletingCategory ? (
        <CategoryDeleteModal key={deletingCategory.id} category={deletingCategory} categories={categories}
          saving={deleting} error={deleteError} onClose={() => setDeletingCategory(null)}
          onDelete={destination => void confirmCategoryRemoval(destination)}
          onArchive={() => void confirmCategoryRemoval("", true)} />
      ) : null}

      {mergingCategory ? (
        <CategoryMergeModal key={mergingCategory.id} category={mergingCategory} categories={categories}
          saving={merging} error={mergeError} onClose={() => { if (!merging) setMergingCategory(null); }}
          onMerge={targetId => void mergeSelectedCategory(targetId)} />
      ) : null}

      {form ? (
        <CategoryFormModal
          error={error}
          form={form}
          parentOptions={parentOptions}
          saving={saving}
          onChange={setForm}
          onClose={closeCategoryForm}
          onSave={() => void saveCategory()}
        />
      ) : null}
    </div>
  );
}
