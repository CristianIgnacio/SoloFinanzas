import { ReportService, type AccountTotal } from '../services/reportService';
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import {
  AccountFormModal,
  AccountVisualCard,
  BankIcon,
  Button,
  EmptyState,
  ErrorState,
  LoadingState,
  PageIntro,
  Panel,
  PencilIcon,
  PlusIcon,
  StatCard,
  StatusNotice,
  TrashIcon,
} from "../components";
import { useFormatCurrency } from "../hooks";
import { accountProductName, useAccountProducts } from "../hooks/useAccountProducts";
import { getAccountPdfAvailability } from "../lib";
import { AccountService } from "../services";
import {
  CurrencyCode,
  InstitutionCode,
  InstitutionLabels,
} from "../types";
import type { Account, AccountCreate, AccountUpdate } from "../types";
import type { AccountFormValues } from "../components/AccountFormModal";

function createEmptyAccountForm(): AccountFormValues {
  return {
    account_type: "",
    account_last4: "",
    currency: CurrencyCode.CLP,
    institution: InstitutionCode.BANCO_DE_CHILE,
    name: "",
    product_code: "",
  };
}

function toAccountFormValues(account: Account): AccountFormValues {
  return {
    account_type: account.account_type,
    account_last4: account.account_last4 ?? "",
    currency: account.currency,
    institution: account.institution,
    name: account.name,
    product_code: account.product_code ?? "",
  };
}

type AccountModalMode = "create" | "edit";

type DeleteAccountModalProps = {
  account: Account;
  deleting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

function DeleteAccountModal({
  account,
  deleting,
  onCancel,
  onConfirm,
}: DeleteAccountModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/30 px-4 py-8 backdrop-blur-sm">
      <div className="surface-card w-full max-w-xl p-6 md:p-8">
        <div className="flex items-start gap-4">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-danger-soft text-danger">
            <TrashIcon className="h-6 w-6" />
          </span>
          <div className="space-y-3">
            <p className="eyebrow m-0 text-danger">Eliminar Cuenta</p>
            <h2 className="text-4xl font-medium tracking-[-0.04em] text-ink">
              Confirmar eliminacion
            </h2>
            <p className="text-muted">
              Vas a eliminar esta cuenta del listado activo. Si tiene registros asociados,
              la app bloqueara la accion para proteger tus datos.
            </p>
          </div>
        </div>

        <div className="mt-6 rounded-[1.75rem] border border-outline/80 bg-paper-soft/80 p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">
                Cuenta seleccionada
              </p>
              <p className="text-2xl font-medium tracking-[-0.03em] text-ink">
                {account.name}
              </p>
              <p className="text-sm text-muted">
                {InstitutionLabels[account.institution]} | {account.account_type}
              </p>
            </div>
            <div className="rounded-2xl border border-white/70 bg-white px-4 py-3 text-right">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">
                Identificador
              </p>
              <p className="mt-2 text-lg font-medium text-ink">
                {account.account_last4 ? `**** ${account.account_last4}` : "No definido"}
              </p>
            </div>
          </div>
        </div>

        <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button tone="secondary" onClick={onCancel} disabled={deleting}>
            Cancelar
          </Button>
          <Button
            className="border-danger bg-danger text-white hover:bg-[#9d4337]"
            onClick={onConfirm}
            disabled={deleting}
          >
            <TrashIcon className="h-5 w-5" />
            {deleting ? "Eliminando..." : "Eliminar cuenta"}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function SettingsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [totals, setTotals] = useState<AccountTotal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [modalMode, setModalMode] = useState<AccountModalMode>("create");
  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);
  const [modalAccountId, setModalAccountId] = useState<number | null>(null);
  const [accountFormError, setAccountFormError] = useState<string | null>(null);
  const [accountForm, setAccountForm] = useState<AccountFormValues>(createEmptyAccountForm);
  const [isSavingAccount, setIsSavingAccount] = useState(false);
  const [deletingAccountId, setDeletingAccountId] = useState<number | null>(null);
  const [accountPendingDelete, setAccountPendingDelete] = useState<Account | null>(null);
  const formatCurrency = useFormatCurrency();
  const { products } = useAccountProducts();

  useEffect(() => {
    if (searchParams.get("new_account") !== "1") return;

    setModalMode("create");
    setModalAccountId(null);
    setAccountForm(createEmptyAccountForm());
    setAccountFormError(null);
    setFeedback(null);
    setIsAccountModalOpen(true);

    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete("new_account");
    setSearchParams(nextParams, { replace: true });
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      try {
        const [accountsPayload, transactionsPayload] = await Promise.all([
          AccountService.getAccounts(),
          ReportService.accounts(),
        ]);

        if (!cancelled) {
          setAccounts(accountsPayload);
          setTotals(transactionsPayload);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Error al cargar cuentas.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadData();

    return () => {
      cancelled = true;
    };
  }, []);

  const totalsByAccount = useMemo(() => new Map(totals.map(item => [item.account_id, item.net])), [totals]);

  const parserReadyCount = accounts.filter((account) =>
    getAccountPdfAvailability(account, products).allowed,
  ).length;

  const getParserLabel = (account: Account) => getAccountPdfAvailability(account, products).label;

  const updateAccountFormField = (field: keyof AccountFormValues, value: string) => {
    setAccountForm((current) => ({
      ...current,
      [field]:
        field === "account_last4"
          ? value.replace(/\D/g, "").slice(0, 4)
          : field === "institution"
            ? (value as InstitutionCode)
            : value,
    }));
  };

  const openCreateAccountModal = () => {
    setModalMode("create");
    setModalAccountId(null);
    setAccountForm(createEmptyAccountForm());
    setAccountFormError(null);
    setFeedback(null);
    setIsAccountModalOpen(true);
  };

  const openEditAccountModal = (account: Account) => {
    setModalMode("edit");
    setModalAccountId(account.id);
    setAccountForm(toAccountFormValues(account));
    setAccountFormError(null);
    setFeedback(null);
    setIsAccountModalOpen(true);
  };

  const closeAccountModal = () => {
    if (isSavingAccount) {
      return;
    }

    setIsAccountModalOpen(false);
    setAccountFormError(null);
  };

  const handleSubmitAccount = async () => {
    if (!accountForm.name.trim()) {
      setAccountFormError("Completa el nombre visible de la cuenta.");
      return;
    }

    const originalAccount = accounts.find((account) => account.id === modalAccountId);
    if (!accountForm.product_code && (
      modalMode === "create" ||
      accountForm.institution !== originalAccount?.institution ||
      !accountForm.account_type
    )) {
      setAccountFormError("Selecciona un producto para la cuenta.");
      return;
    }

    const originalCredit = originalAccount && ["credito", "tarjeta de credito", "tarjeta de crédito"].includes(originalAccount.account_type.toLowerCase());
    if (accountForm.account_type === "credito" && !originalCredit) {
      setAccountFormError("Las tarjetas de crédito aún no se pueden registrar.");
      return;
    }

    if (accountForm.account_last4 && accountForm.account_last4.length !== 4) {
      setAccountFormError("Los ultimos 4 digitos deben tener exactamente 4 numeros.");
      return;
    }

    const payload: AccountCreate | AccountUpdate = {
      name: accountForm.name.trim(),
      institution: accountForm.institution,
      account_type: accountForm.account_type,
      product_code: accountForm.product_code || null,
      account_last4: accountForm.account_last4 || null,
      currency: accountForm.currency,
    };

    setIsSavingAccount(true);
    setAccountFormError(null);

    try {
      if (modalMode === "create") {
        const createdAccount = await AccountService.createAccount(payload);
        setAccounts((current) => [createdAccount, ...current]);
        setFeedback("Cuenta creada correctamente.");
      } else if (modalAccountId !== null) {
        const updatedAccount = await AccountService.updateAccount(modalAccountId, payload);
        setAccounts((current) =>
          current.map((account) => (account.id === updatedAccount.id ? updatedAccount : account)),
        );
        setFeedback("Cuenta actualizada correctamente.");
      }

      setIsAccountModalOpen(false);
      setModalAccountId(null);
      setAccountForm(createEmptyAccountForm());
    } catch (err) {
      setAccountFormError(
        err instanceof Error ? err.message : "No fue posible guardar la cuenta.",
      );
    } finally {
      setIsSavingAccount(false);
    }
  };

  const openDeleteAccountModal = (account: Account) => {
    setFeedback(null);
    setError(null);
    setAccountPendingDelete(account);
  };

  const closeDeleteAccountModal = () => {
    if (deletingAccountId !== null) {
      return;
    }

    setAccountPendingDelete(null);
  };

  const confirmDeleteAccount = async () => {
    if (!accountPendingDelete) {
      return;
    }

    const account = accountPendingDelete;
    setDeletingAccountId(account.id);
    setFeedback(null);
    setError(null);

    try {
      await AccountService.deleteAccount(account.id);
      setAccounts((current) => current.filter((item) => item.id !== account.id));
      setTotals((current) => current.filter((item) => item.account_id !== account.id));
      setFeedback("Cuenta eliminada correctamente.");
      setAccountPendingDelete(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No fue posible eliminar la cuenta.");
    } finally {
      setDeletingAccountId(null);
    }
  };

  return (
    <div className="space-y-8">
      <PageIntro
        eyebrow="Configuracion"
        title="Administrar cuentas"
        description="Crea, edita y elimina las cuentas que utilizas para organizar tus cartolas y movimientos."
        actions={
          <Button onClick={openCreateAccountModal}>
            <PlusIcon className="h-5 w-5" />
            Nueva cuenta
          </Button>
        }
      />

      {feedback ? <StatusNotice tone="success">{feedback}</StatusNotice> : null}
      {loading ? <LoadingState message="Cargando cuentas..." /> : null}
      {error ? <ErrorState message={error} /> : null}

      <section className="grid gap-4 lg:grid-cols-3">
        <StatCard
          label="Cuentas registradas"
          value={String(accounts.length)}
          helper="Total disponible en la app"
          icon={<BankIcon className="h-5 w-5" />}
        />
        <StatCard
          label="Importación PDF habilitada"
          value={String(parserReadyCount)}
          helper="Incluye productos pendientes de verificar"
          tone="income"
          icon={<BankIcon className="h-5 w-5" />}
        />
        <StatCard
          label="Moneda base"
          value="CLP"
          helper="Operacion principal actual"
          tone="neutral"
          icon={<BankIcon className="h-5 w-5" />}
        />
      </section>

      {accounts.length > 0 ? (
        <>
          <section className="grid gap-4 lg:grid-cols-2">
            {accounts.map((account) => (
              <Link
                key={account.id}
                to={`/app/accounts?account_id=${account.id}`}
                aria-label={`Ver detalle de ${account.name}`}
                className="block rounded-[1.75rem] transition hover:-translate-y-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
              >
                <Panel className="h-full space-y-6">
                <div className="max-w-md">
                  <AccountVisualCard
                    institution={account.institution}
                    accountType={account.account_type}
                    productCode={account.product_code}
                    productName={accountProductName(account, products)}
                    name={account.name}
                    accountLast4={account.account_last4}
                    currency={account.currency}
                    compact
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm uppercase tracking-[0.12em] text-muted">Parser</p>
                    <p className="mt-1 text-lg font-medium">
                      {getParserLabel(account)}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm uppercase tracking-[0.12em] text-muted">
                      Identificador
                    </p>
                    <p className="mt-1 text-lg font-medium">
                      {account.account_last4 ? `**** ${account.account_last4}` : "No definido"}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm uppercase tracking-[0.12em] text-muted">Moneda</p>
                    <p className="mt-1 text-lg font-medium">{account.currency}</p>
                  </div>
                  <div>
                    <p className="text-sm uppercase tracking-[0.12em] text-muted">
                      Movimiento neto
                    </p>
                    <p className="mt-1 text-lg font-medium text-primary">
                      {formatCurrency(totalsByAccount.get(account.id) ?? 0)}
                    </p>
                  </div>
                </div>
                </Panel>
              </Link>
            ))}
          </section>

          <Panel>
            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div className="space-y-2">
                <h2 className="text-3xl font-medium tracking-[-0.03em]">Listado detallado</h2>
                <p className="text-muted">
                  Administra tus cuentas, revisa sus identificadores y mantención limpia la base de cuentas disponibles.
                </p>
              </div>
              <Button tone="secondary" onClick={openCreateAccountModal}>
                <PlusIcon className="h-5 w-5" />
                Agregar cuenta
              </Button>
            </div>

            <div className="mt-6 overflow-x-auto">
              <table className="w-full min-w-[920px] border-collapse">
                <thead className="text-left text-sm text-muted">
                  <tr className="border-b border-outline/80">
                    <th className="px-4 py-3 font-medium">Alias</th>
                    <th className="px-4 py-3 font-medium">Institucion</th>
                    <th className="px-4 py-3 font-medium">Producto</th>
                    <th className="px-4 py-3 font-medium">Ultimos 4</th>
                    <th className="px-4 py-3 font-medium">Parser</th>
                    <th className="px-4 py-3 font-medium">Moneda</th>
                    <th className="px-4 py-3 font-medium text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {accounts.map((account) => (
                    <tr key={account.id} className="border-b border-outline/50 last:border-b-0">
                      <td className="px-4 py-4 font-medium">{account.name}</td>
                      <td className="px-4 py-4 text-muted">
                        {InstitutionLabels[account.institution]}
                      </td>
                      <td className="px-4 py-4">{accountProductName(account, products)}</td>
                      <td className="px-4 py-4">{account.account_last4 ?? "No definido"}</td>
                      <td className="px-4 py-4">
                        {getParserLabel(account)}
                      </td>
                      <td className="px-4 py-4">{account.currency}</td>
                      <td className="px-4 py-4">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            title={`Editar ${account.name}`}
                            onClick={() => openEditAccountModal(account)}
                            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-outline bg-white text-muted transition hover:border-primary/30 hover:text-primary"
                          >
                            <PencilIcon className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            title={`Eliminar ${account.name}`}
                            onClick={() => openDeleteAccountModal(account)}
                            disabled={deletingAccountId === account.id}
                            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-outline bg-white text-muted transition hover:border-danger/30 hover:text-danger disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <TrashIcon className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </>
      ) : !loading ? (
        <EmptyState
          title="No hay cuentas registradas"
          description="Cuando agregues una cuenta bancaria, aparecera aqui con sus datos principales y su configuracion de importacion."
          action={
            <Button onClick={openCreateAccountModal}>
              <PlusIcon className="h-5 w-5" />
              Crear primera cuenta
            </Button>
          }
        />
      ) : null}

      {isAccountModalOpen ? (
        <AccountFormModal
          error={accountFormError}
          form={accountForm}
          mode={modalMode}
          onChange={updateAccountFormField}
          onClose={closeAccountModal}
          onSubmit={() => void handleSubmitAccount()}
          saving={isSavingAccount}
        />
      ) : null}

      {accountPendingDelete ? (
        <DeleteAccountModal
          account={accountPendingDelete}
          deleting={deletingAccountId === accountPendingDelete.id}
          onCancel={closeDeleteAccountModal}
          onConfirm={() => void confirmDeleteAccount()}
        />
      ) : null}
    </div>
  );
}





