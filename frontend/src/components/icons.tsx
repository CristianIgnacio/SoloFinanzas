import {
  faArrowDown,
  faArrowUp,
  faBell,
  faBolt,
  faBuildingColumns,
  faCalendarDays,
  faChartColumn,
  faChartLine,
  faChevronDown,
  faCircleCheck,
  faCircleQuestion,
  faCircleUser,
  faDownload,
  faEye,
  faEyeSlash,
  faFilePdf,
  faFloppyDisk,
  faGear,
  faHouse,
  faLock,
  faMoneyBill,
  faPencil,
  faPiggyBank,
  faPlus,
  faReceipt,
  faScaleBalanced,
  faTableCellsLarge,
  faTags,
  faTrash,
  faUpload,
  faUtensils,
  faWallet,
} from "@fortawesome/free-solid-svg-icons";
import {
  FontAwesomeIcon,
  type FontAwesomeIconProps,
} from "@fortawesome/react-fontawesome";
import type { SVGProps } from "react";

type IconProps = Omit<FontAwesomeIconProps, "icon">;

function iconProps(props: IconProps): IconProps {
  return {
    "aria-hidden": true,
    ...props,
  };
}

export function LogoMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 48 48" fill="none" aria-hidden="true" {...props}>
      <rect width="48" height="48" rx="14" fill="currentColor" />
      <rect x="12" y="19" width="4" height="15" rx="2" fill="#fffdf9" />
      <rect x="22" y="11" width="4" height="23" rx="2" fill="#fffdf9" />
      <rect x="32" y="15" width="4" height="19" rx="2" fill="#fffdf9" />
    </svg>
  );
}

export function DashboardIcon(props: IconProps) {
  return <FontAwesomeIcon icon={faTableCellsLarge} {...iconProps(props)} />;
}

export function BankIcon(props: IconProps) {
  return <FontAwesomeIcon icon={faBuildingColumns} {...iconProps(props)} />;
}

export function PdfIcon(props: IconProps) {
  return <FontAwesomeIcon icon={faFilePdf} {...iconProps(props)} />;
}

export function ReportIcon(props: IconProps) {
  return <FontAwesomeIcon icon={faChartColumn} {...iconProps(props)} />;
}

export function CategoriesIcon(props: IconProps) {
  return <FontAwesomeIcon icon={faTags} {...iconProps(props)} />;
}

export function TrendLineIcon(props: IconProps) {
  return <FontAwesomeIcon icon={faChartLine} {...iconProps(props)} />;
}

export function BalanceIcon(props: IconProps) {
  return <FontAwesomeIcon icon={faScaleBalanced} {...iconProps(props)} />;
}

export function InvestmentIcon(props: IconProps) {
  return <FontAwesomeIcon icon={faPiggyBank} {...iconProps(props)} />;
}

export function ReceiptIcon(props: IconProps) {
  return <FontAwesomeIcon icon={faReceipt} {...iconProps(props)} />;
}

export function CalendarIcon(props: IconProps) {
  return <FontAwesomeIcon icon={faCalendarDays} {...iconProps(props)} />;
}

export function SettingsIcon(props: IconProps) {
  return <FontAwesomeIcon icon={faGear} {...iconProps(props)} />;
}

export function BellIcon(props: IconProps) {
  return <FontAwesomeIcon icon={faBell} {...iconProps(props)} />;
}

export function UserCircleIcon(props: IconProps) {
  return <FontAwesomeIcon icon={faCircleUser} {...iconProps(props)} />;
}

export function ArrowUpIcon(props: IconProps) {
  return <FontAwesomeIcon icon={faArrowUp} {...iconProps(props)} />;
}

export function ArrowDownIcon(props: IconProps) {
  return <FontAwesomeIcon icon={faArrowDown} {...iconProps(props)} />;
}

export function WalletIcon(props: IconProps) {
  return <FontAwesomeIcon icon={faWallet} {...iconProps(props)} />;
}

export function PlusIcon(props: IconProps) {
  return <FontAwesomeIcon icon={faPlus} {...iconProps(props)} />;
}

export function ExportIcon(props: IconProps) {
  return <FontAwesomeIcon icon={faDownload} {...iconProps(props)} />;
}

export function SaveIcon(props: IconProps) {
  return <FontAwesomeIcon icon={faFloppyDisk} {...iconProps(props)} />;
}

export function ChevronDownIcon(props: IconProps) {
  return <FontAwesomeIcon icon={faChevronDown} {...iconProps(props)} />;
}

export function CheckCircleIcon(props: IconProps) {
  return <FontAwesomeIcon icon={faCircleCheck} {...iconProps(props)} />;
}

export function LockIcon(props: IconProps) {
  return <FontAwesomeIcon icon={faLock} {...iconProps(props)} />;
}

export function EyeOffIcon(props: IconProps) {
  return <FontAwesomeIcon icon={faEyeSlash} {...iconProps(props)} />;
}

export function EyeIcon(props: IconProps) {
  return <FontAwesomeIcon icon={faEye} {...iconProps(props)} />;
}

export function UploadIcon(props: IconProps) {
  return <FontAwesomeIcon icon={faUpload} {...iconProps(props)} />;
}

export function PencilIcon(props: IconProps) {
  return <FontAwesomeIcon icon={faPencil} {...iconProps(props)} />;
}

export function TrashIcon(props: IconProps) {
  return <FontAwesomeIcon icon={faTrash} {...iconProps(props)} />;
}

export function QuestionIcon(props: IconProps) {
  return <FontAwesomeIcon icon={faCircleQuestion} {...iconProps(props)} />;
}

export function UtensilsIcon(props: IconProps) {
  return <FontAwesomeIcon icon={faUtensils} {...iconProps(props)} />;
}

export function MoneyIcon(props: IconProps) {
  return <FontAwesomeIcon icon={faMoneyBill} {...iconProps(props)} />;
}

export function HouseIcon(props: IconProps) {
  return <FontAwesomeIcon icon={faHouse} {...iconProps(props)} />;
}

export function LightningIcon(props: IconProps) {
  return <FontAwesomeIcon icon={faBolt} {...iconProps(props)} />;
}
