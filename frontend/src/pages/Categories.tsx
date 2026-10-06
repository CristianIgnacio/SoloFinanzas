import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

import {
  Button,
  CategoriesIcon,
  ChevronDownIcon,
  EmptyState,
  ErrorState,
  LoadingState,
  PageIntro,
  Panel,
  PencilIcon,
  PlusIcon,
  StatusNotice,
  TrashIcon,
  cn,
} from "../components";
import { createCategoryMap, getCategoryPath, groupCategories } from "../lib";
import { CategoryService } from "../services";
import { CategoryType } from "../types";
import type { Category, CategorizationRule } from "../types";

type CategoryForm = {
  id: number | null;
  name: string;
  type: CategoryType;
  parent_id: string;
  sort_order: string;
};

const typeLabels: Record<CategoryType, string> = {
  [CategoryType.INCOME]: "Ingreso",
  [CategoryType.EXPENSE]: "Gasto",
  [CategoryType.TRANSFER]: "Transferencia",
};

const typeBadgeClasses: Record<CategoryType, string> = {
  [CategoryType.INCOME]: "bg-primary-mist text-primary",
  [CategoryType.EXPENSE]: "bg-danger-soft text-danger",
  [CategoryType.TRANSFER]: "bg-blue-100 text-blue-700",
};

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
      className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-ink/55 px-4 py-8 backdrop-blur-[2px]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !saving) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="category-form-title"
        className="w-full max-w-2xl rounded-[1.5rem] border border-outline bg-white p-6 md:p-8"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <p className="eyebrow m-0">
              {form.id ? "Editar categoria" : form.parent_id ? "Nueva subcategoria" : "Nueva categoria"}
            </p>
            <h2
              id="category-form-title"
              className="text-4xl font-medium tracking-[-0.04em] text-ink"
            >
              {form.id ? "Actualizar organizacion" : "Agregar al catalogo"}
            </h2>
            <p className="max-w-xl text-muted">
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
          className="mt-8 grid gap-5 md:grid-cols-2"
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

export function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [rules, setRules] = useState<CategorizationRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [form, setForm] = useState<CategoryForm | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [ruleKeyword, setRuleKeyword] = useState("");
  const [rulePriority, setRulePriority] = useState("100");
  const [mergeTargetId, setMergeTargetId] = useState("");
  const [collapsedCategoryIds, setCollapsedCategoryIds] = useState<Set<number>>(
    () => new Set(),
  );
  const [draggedSubcategoryId, setDraggedSubcategoryId] = useState<number | null>(null);
  const [dragOverSubcategoryId, setDragOverSubcategoryId] = useState<number | null>(null);
  const [reorderingSubcategories, setReorderingSubcategories] = useState(false);

  const loadData = async () => {
    try {
      const [categoryPayload, rulePayload] = await Promise.all([
        CategoryService.getCategories(true),
        CategoryService.getCategorizationRules(),
      ]);
      setCategories(categoryPayload);
      setRules(rulePayload);
      setSelectedCategoryId((current) =>
        current !== null && categoryPayload.some((item) => item.id === current)
          ? current
          : null,
      );
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No fue posible cargar las categorias.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const categoryMap = useMemo(() => createCategoryMap(categories), [categories]);
  const groups = useMemo(
    () =>
      groupCategories(
        showArchived ? categories : categories.filter((category) => category.is_active),
      ),
    [categories, showArchived],
  );
  const selectedCategory = selectedCategoryId
    ? categoryMap.get(selectedCategoryId) ?? null
    : null;
  const selectedRules = rules.filter((rule) => rule.category_id === selectedCategoryId);
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
  const mergeTargets = categories.filter(
    (category) =>
      category.id !== selectedCategory?.id &&
      category.is_active &&
      category.type === selectedCategory?.type,
  );

  const editCategory = (category: Category) => {
    setForm({
      id: category.id,
      name: category.name,
      type: category.type,
      parent_id: category.parent_id ? String(category.parent_id) : "",
      sort_order: String(category.sort_order),
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
    setSelectedCategoryId((current) => (current === categoryId ? null : categoryId));
    setMergeTargetId("");
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
    const orderById = new Map(
      reordered.map((category, index) => [category.id, (index + 1) * 10]),
    );

    setCategories((current) =>
      current.map((category) => {
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
          CategoryService.updateCategory(category.id, { sort_order: (index + 1) * 10 }),
        ),
      );
      if (results.some((result) => result.status === "rejected")) {
        throw new Error("No fue posible guardar todo el nuevo orden.");
      }
      setFeedback("Orden de subcategorias guardado.");
    } catch (err) {
      await loadData();
      setError(
        err instanceof Error ? err.message : "No fue posible guardar el orden de las subcategorias.",
      );
    } finally {
      setReorderingSubcategories(false);
    }
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
      };
      if (form.id) {
        await CategoryService.updateCategory(form.id, payload);
        setFeedback("Categoria actualizada correctamente.");
      } else {
        await CategoryService.createCategory({
          ...payload,
          is_default: false,
          is_active: true,
        });
        setFeedback("Categoria creada correctamente.");
      }
      setForm(null);
      await loadData();
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
      await CategoryService.updateCategory(category.id, { is_active: !category.is_active });
      setFeedback(
        category.is_active
          ? "Categoria archivada; su historial permanece intacto."
          : "Categoria reactivada.",
      );
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : `No fue posible ${action} la categoria.`);
    }
  };

  const removeCategory = async (category: Category) => {
    if (!window.confirm(`¿Eliminar definitivamente ${category.name}?`)) return;
    try {
      await CategoryService.deleteCategory(category.id);
      setFeedback("Categoria sin uso eliminada.");
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No fue posible eliminar la categoria.");
    }
  };

  const createRule = async () => {
    if (!selectedCategory || !ruleKeyword.trim()) return;
    try {
      await CategoryService.createCategorizationRule({
        keyword: ruleKeyword.trim(),
        category_id: selectedCategory.id,
        priority: Number(rulePriority) || 100,
      });
      setRuleKeyword("");
      setFeedback("Regla creada correctamente.");
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No fue posible crear la regla.");
    }
  };

  const removeRule = async (ruleId: number) => {
    try {
      await CategoryService.deleteCategorizationRule(ruleId);
      setFeedback("Regla eliminada.");
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No fue posible eliminar la regla.");
    }
  };

  const mergeSelectedCategory = async () => {
    if (!selectedCategory || !mergeTargetId) return;
    if (!window.confirm("Los movimientos y reglas se trasladaran al destino. ¿Continuar?")) return;
    try {
      const targetId = Number(mergeTargetId);
      await CategoryService.mergeCategory(selectedCategory.id, targetId);
      setSelectedCategoryId(targetId);
      setMergeTargetId("");
      setFeedback("Categorias fusionadas correctamente.");
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No fue posible fusionar las categorias.");
    }
  };

  return (
    <div className="space-y-8">
      <PageIntro
        eyebrow="Organizacion"
        title="Categorias y subcategorias"
        description="Ordena tus movimientos en dos niveles y administra las reglas que los clasifican automaticamente."
        actions={
          <Button onClick={() => openCreateCategory()}>
            <PlusIcon className="h-5 w-5" />
            Nueva categoria
          </Button>
        }
      />

      {feedback ? <StatusNotice tone="success">{feedback}</StatusNotice> : null}
      {error && !form ? <ErrorState message={error} /> : null}
      {loading ? <LoadingState message="Cargando categorias..." /> : null}

      {!loading ? (
        <section className="grid gap-4 md:grid-cols-3">
          {[
            ["Activas", activeCount],
            ["Categorias principales", rootCount],
            ["Subcategorias", subcategoryCount],
          ].map(([label, value]) => (
            <Panel key={label} className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-muted">{label}</p>
                <p className="mt-2 text-4xl font-semibold tracking-[-0.04em]">{value}</p>
              </div>
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary-mist text-primary">
                <CategoriesIcon className="h-5 w-5" />
              </span>
            </Panel>
          ))}
        </section>
      ) : null}

      <div className="flex items-center justify-between gap-4">
        <h2 className="text-3xl font-medium tracking-[-0.03em]">Catalogo</h2>
        <div className="flex items-center gap-4">
          {reorderingSubcategories ? (
            <span role="status" className="text-sm font-medium text-primary">
              Guardando orden...
            </span>
          ) : null}
          <label className="flex items-center gap-2 text-sm text-muted">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(event) => setShowArchived(event.target.checked)}
              className="h-4 w-4 accent-primary"
            />
            Mostrar archivadas
          </label>
        </div>
      </div>

      {groups.length === 0 && !loading ? (
        <EmptyState
          title="No hay categorias"
          description="Crea la primera categoria para comenzar a organizar tus movimientos."
        />
      ) : (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(340px,0.65fr)]">
          <div className="space-y-4">
            {groups.map(({ root, children }) => {
              const isCollapsed = collapsedCategoryIds.has(root.id);
              const isRootSelected = selectedCategoryId === root.id;
              return (
                <Panel
                  key={root.id}
                  className={cn(
                    "relative overflow-hidden transition-colors",
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
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex min-w-0 items-start gap-3">
                      {children.length > 0 ? (
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
                          className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-outline bg-white text-muted transition hover:border-primary/40 hover:text-primary"
                        >
                          <ChevronDownIcon
                            className={cn(
                              "h-5 w-5 transition-transform duration-200",
                              isCollapsed && "-rotate-90",
                            )}
                          />
                        </button>
                      ) : (
                        <span aria-hidden="true" className="mt-0.5 h-10 w-10 shrink-0" />
                      )}
                      <button
                        type="button"
                        onClick={() => toggleCategorySelection(root.id)}
                        aria-pressed={isRootSelected}
                        className="min-w-0 text-left"
                      >
                        <div className="flex flex-wrap items-center gap-3">
                          <h3 className="text-2xl font-medium">{root.name}</h3>
                          <span
                            className={cn(
                              "rounded-full px-3 py-1 text-xs font-semibold",
                              typeBadgeClasses[root.type],
                            )}
                          >
                            {typeLabels[root.type]}
                          </span>
                          {isRootSelected ? (
                            <span className="rounded-full bg-primary px-3 py-1 text-xs font-semibold text-white">
                              Seleccionada
                            </span>
                          ) : null}
                          {!root.is_active ? <span className="text-xs text-danger">Archivada</span> : null}
                        </div>
                        <p className="mt-2 text-sm text-muted">
                          {root.transaction_count} movimientos · {root.rule_count} reglas
                        </p>
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <Button
                        tone="ghost"
                        className="!gap-1.5 !rounded-xl !px-3 !py-2 !text-sm"
                        onClick={() => openCreateCategory(root)}
                      >
                        <PlusIcon className="h-3.5 w-3.5" /> Subcategoria
                      </Button>
                      <Button
                        tone="ghost"
                        className="!gap-1.5 !rounded-xl !px-3 !py-2 !text-sm"
                        onClick={() => editCategory(root)}
                      >
                        <PencilIcon className="h-3.5 w-3.5" /> Editar
                      </Button>
                      <Button
                        tone="secondary"
                        className="!rounded-xl !px-3 !py-2 !text-sm"
                        onClick={() => void toggleArchive(root)}
                      >
                        {root.is_active ? "Archivar" : "Reactivar"}
                      </Button>
                    </div>
                  </div>

                  {children.length > 0 && !isCollapsed ? (
                    <div
                      id={`subcategory-list-${root.id}`}
                      className="mt-5 space-y-2 border-l-2 border-primary/15 pl-4"
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
                          "relative flex flex-col gap-3 overflow-hidden rounded-2xl border border-outline/70 bg-paper-soft/60 p-4 transition sm:flex-row sm:items-center sm:justify-between",
                          selectedCategoryId === child.id &&
                            "border-primary/55 bg-primary-mist/55 ring-1 ring-primary/10",
                          !child.is_active && "opacity-60",
                          draggedSubcategoryId === child.id && "opacity-45",
                          dragOverSubcategoryId === child.id &&
                            draggedSubcategoryId !== child.id &&
                            "border-primary/50 bg-primary-mist/50",
                        )}
                      >
                        {selectedCategoryId === child.id ? (
                          <span
                            aria-hidden="true"
                            className="absolute inset-y-0 left-0 w-1 bg-primary"
                          />
                        ) : null}
                        <div className="flex min-w-0 items-center gap-3">
                          <button
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
                            className="flex h-9 w-9 shrink-0 cursor-grab items-center justify-center rounded-xl border border-outline bg-white text-muted transition hover:border-primary/40 hover:text-primary active:cursor-grabbing disabled:cursor-wait disabled:opacity-50"
                          >
                            <DragHandleDots />
                          </button>
                          <button
                            type="button"
                            onClick={() => toggleCategorySelection(child.id)}
                            aria-pressed={selectedCategoryId === child.id}
                            className="min-w-0 text-left"
                          >
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="truncate font-medium">{child.name}</p>
                              {selectedCategoryId === child.id ? (
                                <span className="rounded-full bg-primary px-2.5 py-1 text-[0.7rem] font-semibold text-white">
                                  Seleccionada
                                </span>
                              ) : null}
                            </div>
                            <p className="mt-1 text-xs text-muted">
                              {child.transaction_count} movimientos · {child.rule_count} reglas
                            </p>
                          </button>
                        </div>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            title="Editar"
                            onClick={() => editCategory(child)}
                            className="rounded-full border border-outline bg-white p-2 text-muted hover:text-primary"
                          >
                            <PencilIcon className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            title={child.is_active ? "Archivar" : "Reactivar"}
                            onClick={() => void toggleArchive(child)}
                            className="rounded-full border border-outline bg-white px-3 py-2 text-xs text-muted hover:text-primary"
                          >
                            {child.is_active ? "Archivar" : "Reactivar"}
                          </button>
                          {!child.is_default && !child.transaction_count && !child.rule_count ? (
                            <button
                              type="button"
                              title="Eliminar"
                              onClick={() => void removeCategory(child)}
                              className="rounded-full border border-outline bg-white p-2 text-muted hover:text-danger"
                            >
                              <TrashIcon className="h-4 w-4" />
                            </button>
                          ) : null}
                        </div>
                      </div>
                    ))}
                    </div>
                  ) : null}
                </Panel>
              );
            })}
          </div>

          <div className="space-y-5">
            <Panel>
              <h2 className="text-2xl font-medium">Reglas automaticas</h2>
              {selectedCategory ? (
                <>
                  <div className="mt-4 rounded-2xl border border-primary/20 bg-primary-mist/55 px-4 py-3">
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
                    <p className="mt-2 text-xs text-muted">
                      Las nuevas reglas se asignaran a esta categoria.
                    </p>
                  </div>
                  <div className="mt-5 space-y-3">
                    <input
                      value={ruleKeyword}
                      onChange={(event) => setRuleKeyword(event.target.value)}
                      placeholder="Palabra o comercio"
                      disabled={!selectedCategory.is_active}
                      className="w-full rounded-2xl border border-outline bg-white px-4 py-3"
                    />
                    <div className="flex gap-2">
                      <input
                        type="number"
                        value={rulePriority}
                        onChange={(event) => setRulePriority(event.target.value)}
                        className="w-28 rounded-2xl border border-outline bg-white px-4 py-3"
                        title="Prioridad"
                      />
                      <Button
                        className="flex-1"
                        disabled={!ruleKeyword.trim() || !selectedCategory.is_active}
                        onClick={() => void createRule()}
                      >
                        Agregar regla
                      </Button>
                    </div>
                  </div>
                  <div className="mt-5 max-h-[23.5rem] space-y-2 overflow-y-auto overscroll-contain pr-1">
                    {selectedRules.map((rule) => (
                      <div key={rule.id} className="flex items-center justify-between gap-3 rounded-xl bg-paper-soft px-3 py-2">
                        <div>
                          <p className="font-medium">{rule.keyword}</p>
                          <p className="text-xs text-muted">Prioridad {rule.priority}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => void removeRule(rule.id)}
                          className="rounded-full p-2 text-muted hover:bg-danger-soft hover:text-danger"
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

            {selectedCategory ? (
              <Panel>
                <h2 className="text-xl font-medium">Fusionar categoria</h2>
                <div className="mt-4 rounded-2xl border border-primary/20 bg-primary-mist/55 px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary/75">
                    Categoria de origen
                  </p>
                  <p className="mt-1 font-semibold text-ink">
                    {getCategoryPath(selectedCategory.id, categoryMap)}
                  </p>
                </div>
                <p className="mt-2 text-sm leading-6 text-muted">
                  Traslada movimientos y reglas a otra categoria del mismo tipo. La categoria actual se elimina.
                </p>
                <select
                  value={mergeTargetId}
                  onChange={(event) => setMergeTargetId(event.target.value)}
                  className="mt-4 w-full rounded-2xl border border-outline bg-white px-4 py-3"
                >
                  <option value="">Seleccionar destino</option>
                  {mergeTargets.map((category) => (
                    <option key={category.id} value={category.id}>
                      {getCategoryPath(category.id, categoryMap)}
                    </option>
                  ))}
                </select>
                <Button
                  tone="secondary"
                  className="mt-3 w-full"
                  disabled={!mergeTargetId || selectedCategory.is_default}
                  onClick={() => void mergeSelectedCategory()}
                >
                  Fusionar
                </Button>
                {selectedCategory.is_default ? (
                  <p className="mt-2 text-xs text-muted">
                    Las categorias predeterminadas pueden archivarse, pero no fusionarse.
                  </p>
                ) : null}
              </Panel>
            ) : null}
          </div>
        </div>
      )}

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
