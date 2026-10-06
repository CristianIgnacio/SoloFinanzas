from starlette.responses import JSONResponse


class BodyLimitMiddleware:
    """Bound multipart bodies before Starlette spools them, including chunked uploads."""

    def __init__(self, app, maximum=12 * 1024 * 1024):
        self.app, self.maximum = app, maximum

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        # Buffer only the bounded body. Never forward a partially accepted upload.
        chunks, size = [], 0
        while True:
            message = await receive()
            if message["type"] == "http.disconnect":
                return
            size += len(message.get("body", b""))
            if size > self.maximum:
                response = JSONResponse({"detail": "La solicitud supera el límite permitido."}, 413)
                return await response(scope, receive, send)
            chunks.append(message)
            if not message.get("more_body", False):
                break
        async def bounded_receive():
            return chunks.pop(0) if chunks else await receive()
        await self.app(scope, bounded_receive, send)
