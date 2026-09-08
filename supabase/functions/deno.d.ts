declare namespace Deno {
  type ServeHandler = (request: Request) => Response | Promise<Response>;

  function serve(handler: ServeHandler): void;

  namespace env {
    function get(key: string): string | undefined;
  }
}
