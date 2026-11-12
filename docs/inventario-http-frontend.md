**Inventario HTTP del frontend — generado desde TypeScript**

Regenerar: `node benchmarks/inventory.mjs` desde frontend. Incluye todos los usos de apiClient, incluso llamadas directas. Los consumidores en src/query son opciones preparadas, todavía no conectadas a pantallas.

| Método | Endpoint | Definición | Consumidores |
| --- | --- | --- | --- |
| GET | "/me" | src/auth/AuthProvider.tsx:64 | Llamada directa en la definición |
| GET | "/me/export" | src/pages/Profile.tsx:62 | Llamada directa en la definición |
| DELETE | "/me" | src/pages/Profile.tsx:123 | Llamada directa en la definición |
| GET | "/cash-account" | src/services/accountService.ts:6 (AccountService.getCashAccount) | src/pages/Accounts.tsx:207<br>src/pages/Analytics.tsx:345<br>src/pages/Dashboard.tsx:315<br>src/pages/Transactions.tsx:262<br>src/query/accounts.ts:17 |
| GET | "/cash-account/balance" | src/services/accountService.ts:9 (AccountService.getCashBalance) | src/components/CashAccountPanel.tsx:121<br>src/pages/Accounts.tsx:208<br>src/pages/Dashboard.tsx:316<br>src/query/accounts.ts:21 |
| PUT | "/cash-account/balance" | src/services/accountService.ts:12 (AccountService.updateCashBalance) | src/components/CashAccountPanel.tsx:163 |
| DELETE | "/cash-account/balance" | src/services/accountService.ts:15 (AccountService.clearCashBalance) | src/components/CashAccountPanel.tsx:178 |
| GET | "/account-products" | src/services/accountService.ts:18 (AccountService.getProducts) | src/hooks/useAccountProducts.ts:12<br>src/pages/ImportStatements.tsx:121<br>src/query/accounts.ts:13 |
| GET | "/accounts" | src/services/accountService.ts:22 (AccountService.getAccounts) | src/pages/Accounts.tsx:205<br>src/pages/Analytics.tsx:344<br>src/pages/Dashboard.tsx:313<br>src/pages/ImportStatements.tsx:120<br>src/pages/Transactions.tsx:262<br>src/query/accounts.ts:9 |
| POST | "/accounts" | src/services/accountService.ts:26 (AccountService.createAccount) | src/pages/Accounts.tsx:374<br>src/pages/Dashboard.tsx:427 |
| PUT | `/accounts/${accountId}` | src/services/accountService.ts:30 (AccountService.updateAccount) | src/pages/Accounts.tsx:381 |
| DELETE | `/accounts/${accountId}` | src/services/accountService.ts:34 (AccountService.deleteAccount) | src/pages/Accounts.tsx:402 |
| GET | "/categorization-rules/patterns" | src/services/categoryService.ts:20 (CategoryService.patterns) | src/components/CategoryLearning.tsx:16<br>src/components/CategoryLearning.tsx:19<br>src/query/learning.ts:9 |
| POST | `/categorization-rules/patterns/${id}/decision` | src/services/categoryService.ts:24 (CategoryService.decidePattern) | src/components/CategoryLearning.tsx:30<br>src/components/CategoryProposalModal.tsx:36 |
| GET | "/categories/catalog-preview" | src/services/categoryService.ts:27 (CategoryService.catalogPreview) | src/pages/Categories.tsx:593<br>src/query/categories.ts:17 |
| GET | "/categorization-rules/memory" | src/services/categoryService.ts:31 (CategoryService.memory) | src/query/learning.ts:19 |
| POST | "/categorization-rules/memory/forget" | src/services/categoryService.ts:35 (CategoryService.forgetMemory) | Sin consumidor directo encontrado |
| GET | "/categorization-rules/proposals" | src/services/categoryService.ts:39 (CategoryService.ruleProposals) | src/components/CategoryProposalModal.tsx:43<br>src/pages/Transactions.tsx:108<br>src/query/learning.ts:14 |
| POST | "/categorization-rules/proposals" | src/services/categoryService.ts:43 (CategoryService.acceptRuleProposal) | Sin consumidor directo encontrado |
| GET | "/categories" | src/services/categoryService.ts:46 (CategoryService.getCategories) | src/pages/Accounts.tsx:206<br>src/pages/Analytics.tsx:346<br>src/pages/Categories.tsx:591<br>src/pages/Dashboard.tsx:314<br>src/pages/ImportStatements.tsx:122<br>src/pages/Transactions.tsx:262<br>src/query/categories.ts:9 |
| POST | "/categories" | src/services/categoryService.ts:52 (CategoryService.createCategory) | src/pages/Categories.tsx:807 |
| PATCH | `/categories/${categoryId}` | src/services/categoryService.ts:59 (CategoryService.updateCategory) | src/pages/Categories.tsx:757<br>src/pages/Categories.tsx:804<br>src/pages/Categories.tsx:827<br>src/pages/Categories.tsx:851 |
| DELETE | `/categories/${categoryId}` | src/services/categoryService.ts:63 (CategoryService.deleteCategory) | src/pages/Categories.tsx:858 |
| POST | `/categories/${categoryId}/merge` | src/services/categoryService.ts:67 (CategoryService.mergeCategory) | src/pages/Categories.tsx:854<br>src/pages/Categories.tsx:917 |
| GET | "/categorization-rules" | src/services/categoryService.ts:75 (CategoryService.getCategorizationRules) | src/pages/Categories.tsx:592<br>src/query/categories.ts:13 |
| POST | "/categorization-rules" | src/services/categoryService.ts:83 (CategoryService.createCategorizationRule) | src/pages/Categories.tsx:880 |
| POST | "/categorization-rules/preview" | src/services/categoryService.ts:87 (CategoryService.previewCategorizationRule) | src/pages/Categories.tsx:892 |
| PATCH | `/categorization-rules/${ruleId}` | src/services/categoryService.ts:94 (CategoryService.updateCategorizationRule) | src/pages/Categories.tsx:879<br>src/pages/Categories.tsx:1327 |
| DELETE | `/categorization-rules/${ruleId}` | src/services/categoryService.ts:102 (CategoryService.deleteCategorizationRule) | src/pages/Categories.tsx:904 |
| GET | "/dashboard" | src/services/dashboardService.ts:6 (DashboardService.getDashboard) | src/hooks/useDashboard.ts:24<br>src/query/dashboard.ts:9 |
| GET | "/me" | src/services/profileService.ts:6 (ProfileService.getProfile) | src/pages/Dashboard.tsx:317<br>src/query/profile.ts:9 |
| PUT | "/me/onboarding" | src/services/profileService.ts:10 (ProfileService.startWithCash) | src/pages/Dashboard.tsx:450 |
| GET | "/reports/accounts" | src/services/reportService.ts:11 (ReportService.accounts) | src/components/CashAccountPanel.tsx:122<br>src/pages/Accounts.tsx:256<br>src/pages/Accounts.tsx:481<br>src/query/reports.ts:9 |
| GET | "/reports/periods" | src/services/reportService.ts:13 (ReportService.periods) | src/pages/Analytics.tsx:347<br>src/pages/Transactions.tsx:262<br>src/query/reports.ts:13 |
| GET | "/statements" | src/services/statementService.ts:14 (StatementService.getStatements) | src/components/DeleteAccountModal.tsx:23<br>src/pages/Accounts.tsx:254<br>src/pages/Accounts.tsx:479<br>src/query/statements.ts:9 |
| POST | "/statements" | src/services/statementService.ts:20 (StatementService.createStatement) | Sin consumidor directo encontrado |
| PATCH | `/statements/${statementId}/status` | src/services/statementService.ts:27 (StatementService.updateStatus) | Sin consumidor directo encontrado |
| GET | `/statements/${statementId}/deletion-impact` | src/services/statementService.ts:37 (StatementService.getDeletionImpact) | src/pages/Accounts.tsx:428<br>src/query/statements.ts:13 |
| DELETE | `/statements/${statementId}` | src/services/statementService.ts:43 (StatementService.deleteStatement) | src/pages/Accounts.tsx:461 |
| POST | "/statement-imports/pdf/preview" | src/services/statementService.ts:51 (StatementService.previewPdf) | src/pages/ImportStatements.tsx:251 |
| POST | "/statement-imports/pdf" | src/services/statementService.ts:65 (StatementService.importPdf) | Sin consumidor directo encontrado |
| POST | "/statement-imports/pdf/reviewed" | src/services/statementService.ts:81 (StatementService.importReviewedPdf) | src/pages/ImportStatements.tsx:284 |
| POST | `/transactions/${transactionId}/cash-link` | src/services/transactionService.ts:11 (TransactionService.linkCash) | src/pages/Transactions.tsx:497 |
| DELETE | `/transactions/${transactionId}/cash-link` | src/services/transactionService.ts:15 (TransactionService.unlinkCash) | src/components/CashAccountPanel.tsx:194<br>src/pages/Transactions.tsx:495 |
| POST | "/cash-transactions" | src/services/transactionService.ts:18 (TransactionService.createCashTransaction) | src/components/CashMovementFormModal.tsx:60 |
| PUT | `/cash-transactions/${id}` | src/services/transactionService.ts:22 (TransactionService.updateCashTransaction) | src/components/CashMovementFormModal.tsx:59 |
| DELETE | `/cash-transactions/${id}` | src/services/transactionService.ts:26 (TransactionService.deleteCashTransaction) | src/components/CashMovementFormModal.tsx:75 |
| GET | '/transaction-pages' | src/services/transactionService.ts:29 (TransactionService.getPage) | src/components/CashAccountPanel.tsx:120<br>src/components/DeleteAccountModal.tsx:24<br>src/components/TransactionExportModal.tsx:61<br>src/pages/Accounts.tsx:255<br>src/pages/Accounts.tsx:480<br>src/pages/Dashboard.tsx:293<br>src/pages/Transactions.tsx:224<br>src/pages/Transactions.tsx:275<br>src/pages/Transactions.tsx:294<br>src/query/transactions.ts:9 |
| GET | "/transactions" | src/services/transactionService.ts:42 (TransactionService.getTransactions) | src/pages/Analytics.tsx:158<br>src/pages/Dashboard.tsx:172 |
| POST | "/transactions" | src/services/transactionService.ts:48 (TransactionService.createTransaction) | Sin consumidor directo encontrado |
| POST | "/transactions/bulk" | src/services/transactionService.ts:54 (TransactionService.createBulkTransactions) | Sin consumidor directo encontrado |
| PATCH | `/transactions/${transactionId}/category` | src/services/transactionService.ts:62 (TransactionService.updateCategory) | src/pages/Transactions.tsx:432 |
| POST | `/transactions/${transactionId}/category/undo` | src/services/transactionService.ts:72 (TransactionService.undoCategory) | src/pages/Transactions.tsx:477 |

Total: 53 puntos de transporte (20 GET; 33 operaciones restantes).

Alcance: inventario estático de apiClient, no de todo el tráfico del navegador. Supabase Auth, Vercel Analytics, assets y llamadas internas del backend quedan fuera. Los POST de preview procesan datos sin equivaler necesariamente a una escritura persistida. Los GET de /me y propuestas/patrones pueden aprovisionar/sincronizar datos: revisar sus efectos antes de añadir reintentos.
