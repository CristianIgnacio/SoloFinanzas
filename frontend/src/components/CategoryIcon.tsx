import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faTag, faUtensils, faHouse, faBolt, faCar, faBriefcaseMedical,
  faBagShopping, faGraduationCap, faMasksTheater, faPlane, faBuildingColumns,
  faGift, faMoneyBillWave, faArrowRightArrowLeft, faCircleQuestion,
  faPaw, faMugHot, faDumbbell, faBriefcase, faGamepad, faBaby,
  faCartShopping, faHeart, faMusic, faBook, faLaptop, faPhone,
  faCreditCard, faCoins, faTree, faScrewdriverWrench } from "@fortawesome/free-solid-svg-icons";
import type { Category } from "../types";

export const CATEGORY_ICONS = {
  tag: { label: "Etiqueta", icon: faTag }, food: { label: "Alimentación", icon: faUtensils },
  home: { label: "Hogar", icon: faHouse }, bills: { label: "Servicios", icon: faBolt },
  transport: { label: "Transporte", icon: faCar }, health: { label: "Salud", icon: faBriefcaseMedical },
  shopping: { label: "Compras", icon: faBagShopping }, education: { label: "Educación", icon: faGraduationCap },
  leisure: { label: "Ocio", icon: faMasksTheater }, travel: { label: "Viajes", icon: faPlane },
  finance: { label: "Finanzas", icon: faBuildingColumns }, gifts: { label: "Regalos", icon: faGift },
  income: { label: "Ingresos", icon: faMoneyBillWave }, transfers: { label: "Transferencias", icon: faArrowRightArrowLeft },
  pets: { label: "Mascotas", icon: faPaw }, coffee: { label: "Café", icon: faMugHot },
  sports: { label: "Deporte", icon: faDumbbell }, work: { label: "Trabajo", icon: faBriefcase },
  games: { label: "Videojuegos", icon: faGamepad }, baby: { label: "Bebés", icon: faBaby },
  groceries: { label: "Supermercado", icon: faCartShopping }, wellbeing: { label: "Bienestar", icon: faHeart },
  music: { label: "Música", icon: faMusic }, books: { label: "Libros", icon: faBook },
  technology: { label: "Tecnología", icon: faLaptop }, phone: { label: "Teléfono", icon: faPhone },
  card: { label: "Tarjeta", icon: faCreditCard }, savings: { label: "Ahorros", icon: faCoins },
  nature: { label: "Naturaleza", icon: faTree }, repairs: { label: "Reparaciones", icon: faScrewdriverWrench },
};

export const CATEGORY_COLORS = {
  slate: { label: "Gris", foreground: "#475569", background: "#f1f5f9" },
  orange: { label: "Naranja", foreground: "#9a3412", background: "#ffedd5" },
  amber: { label: "Ámbar", foreground: "#854d0e", background: "#fef9c3" },
  blue: { label: "Azul", foreground: "#1e40af", background: "#dbeafe" },
  teal: { label: "Turquesa", foreground: "#115e59", background: "#ccfbf1" },
  purple: { label: "Violeta", foreground: "#6b21a8", background: "#f3e8ff" },
  pink: { label: "Rosa", foreground: "#9d174d", background: "#fce7f3" },
  green: { label: "Verde", foreground: "#166534", background: "#dcfce7" },
  red: { label: "Rojo", foreground: "#991b1b", background: "#fee2e2" },
  sky: { label: "Celeste", foreground: "#075985", background: "#e0f2fe" },
  indigo: { label: "Índigo", foreground: "#3730a3", background: "#e0e7ff" },
  brown: { label: "Café", foreground: "#713f12", background: "#f5e6d3" },
};

type IconKey = keyof typeof CATEGORY_ICONS;
type ColorKey = keyof typeof CATEGORY_COLORS;
const DEFAULT_COLORS: Record<string, ColorKey> = {
  food: "orange", home: "amber", bills: "amber", transport: "blue", health: "teal",
  shopping: "pink", education: "purple", leisure: "purple", travel: "blue",
  finance: "slate", gifts: "pink", income: "green", transfers: "blue",
};

type AppearanceSource = Pick<Category, "code" | "parent_id" | "icon" | "color">;

export function categoryAppearance(category?: AppearanceSource, categoryMap?: Map<number, Category>) {
  const root = category?.parent_id ? categoryMap?.get(category.parent_id) : category;
  const code = root?.code ?? "tag";
  const icon = category?.icon ?? root?.icon ?? code;
  const color = category?.color ?? root?.color ?? DEFAULT_COLORS[code] ?? "slate";
  return {
    icon: (Object.prototype.hasOwnProperty.call(CATEGORY_ICONS, icon) ? icon : "tag") as IconKey,
    color: (Object.prototype.hasOwnProperty.call(CATEGORY_COLORS, color) ? color : "slate") as ColorKey,
  };
}

export function CategoryIcon({ category, categoryMap, size = "md", compactOnMobile = false }: {
  category?: AppearanceSource; categoryMap?: Map<number, Category>; size?: "sm" | "md"; compactOnMobile?: boolean;
}) {
  const appearance = categoryAppearance(category, categoryMap);
  const palette = CATEGORY_COLORS[appearance.color];
  const sizeClass = size === "sm"
    ? compactOnMobile ? "h-6 w-6 rounded-md text-[11px] sm:h-7 sm:w-7 sm:rounded-lg sm:text-xs" : "h-7 w-7 rounded-lg text-xs"
    : compactOnMobile ? "h-8 w-8 rounded-lg text-sm sm:h-12 sm:w-12 sm:rounded-xl sm:text-xl" : "h-9 w-9 rounded-xl text-base sm:h-12 sm:w-12 sm:text-xl";
  return <span aria-hidden="true" data-category-icon={category ? appearance.icon : "uncategorized"}
    data-category-color={appearance.color}
    className={`inline-flex shrink-0 items-center justify-center ${sizeClass}`}
    style={{ color: palette.foreground, backgroundColor: palette.background }}>
    <FontAwesomeIcon icon={category ? CATEGORY_ICONS[appearance.icon].icon : faCircleQuestion} />
  </span>;
}
