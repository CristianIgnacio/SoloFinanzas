"""One bounded, disposable parser process. No PDFs or passwords are persisted."""
import asyncio
import multiprocessing
import os

from fastapi import HTTPException

from app.core.config import settings
from app.schemas.statement import PdfPreview

_slot = asyncio.Lock()


def _parse_child(pipe, arguments):
    try:
        # PDF libraries can emit document fragments in warnings. No parser output
        # is sent to the host logs; only the sanitized result crosses the pipe.
        import sys
        sys.stdout = open(os.devnull, "w")
        sys.stderr = open(os.devnull, "w")
        if os.name != "nt":
            import resource
            resource.setrlimit(resource.RLIMIT_AS, (384 * 1024 * 1024,) * 2)
        from app.services.pdf_importer import inspect_pdf, PdfImportError
        try:
            preview = inspect_pdf(**arguments)
            pipe.send((True, preview.model_dump(mode="json")))
        except PdfImportError:
            pipe.send((False, "No se pudo leer la cartola. Revisa el banco, el formato y la contraseña; máximo 50 páginas."))
    except Exception:
        pipe.send((False, "No se pudo procesar el PDF dentro de los límites disponibles."))
    finally:
        pipe.close()


def _run_parser(arguments):
    context = multiprocessing.get_context("spawn")
    receive, send = context.Pipe(duplex=False)
    process = context.Process(target=_parse_child, args=(send, arguments), daemon=True)
    try:
        process.start()
        send.close()
        if not receive.poll(settings.pdf_timeout_seconds):
            raise HTTPException(422, "El PDF superó el tiempo máximo de procesamiento (30 segundos).")
        try:
            success, result = receive.recv()
        except EOFError as error:
            raise HTTPException(422, "El PDF superó los recursos disponibles.") from error
        if not success:
            raise HTTPException(422, result)
        return PdfPreview.model_validate(result)
    finally:
        if process.pid is not None:
            if process.is_alive():
                process.terminate()
            process.join(timeout=2)
            if process.is_alive():
                process.kill()
                process.join()
        receive.close()
        send.close()


async def inspect_pdf_isolated(**arguments):
    if _slot.locked():
        raise HTTPException(429, "Hay otra cartola en proceso. Intenta nuevamente en unos segundos.", headers={"Retry-After": "5"})
    async with _slot:
        # Shield the worker so a disconnected client cannot free the slot while
        # its parser still runs. Always wait for cleanup on cancellation.
        task = asyncio.create_task(asyncio.to_thread(_run_parser, arguments))
        try:
            return await asyncio.shield(task)
        except asyncio.CancelledError:
            await task
            raise
