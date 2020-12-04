const { URL } = require('url');

const toPagination = (req, rows, count) => {
  const {
    query: { perPage = 10, page = 1 },
    url: originalUrl,
    hostname,
    protocol,
    port,
  } = req;
  const totalPages = Math.max(Math.ceil(count / perPage), 1);
  const uri = new URL(
    originalUrl,
    `${protocol}://${hostname}${port ? `:${port}` : ''}`,
  );

  uri.searchParams.set('page', 'PAGE_PLACEHOLDER');
  const uriTemplate = String(uri);

  uri.searchParams.set('page', 1);
  const first = String(uri);

  uri.searchParams.set('page', totalPages);
  const last = String(uri);

  const meta = {
    totalPages,
    totalCount: count,
    uriTemplate,
    first,
    last,
  };

  if (page < totalPages) {
    uri.searchParams.set('page', page + 1);
    meta.next = String(uri);
  }
  if (page > 1 && page <= totalPages) {
    uri.searchParams.set('page', page - 1);
    meta.prev = String(uri);
  }

  return {
    status: 200,
    data: rows,
    meta,
  };
};

module.exports = { toPagination };
