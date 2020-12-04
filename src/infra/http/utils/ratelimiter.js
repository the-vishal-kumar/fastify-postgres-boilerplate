const createRateLimiter = ({
  sequelize: {
    db,
    models: { RateLimits },
  },
}) => {
  function RateLimiterStore(options) {
    this.options = options;
    this.route = '';
  }

  RateLimiterStore.prototype.routeKey = function routeKey(route) {
    if (route) this.route = route;
    return route;
  };

  RateLimiterStore.prototype.incr = async function incr(key, cb) {
    const now = new Date().getTime();
    const ttl = now + this.options.timeWindow;
    const cond = { Route: this.route, Source: key };

    const RateLimit = await RateLimits.findOne({ where: cond });

    if (RateLimit && parseInt(RateLimit.TTL, 10) > now) {
      try {
        await RateLimit.update({ Count: RateLimit.Count + 1 }, cond);
        cb(null, {
          current: RateLimit.Count + 1,
          ttl: RateLimit.TTL,
        });
      } catch (err) {
        cb(err, {
          current: 0,
        });
      }
    } else {
      db.query(
        `INSERT INTO "RateLimits"("Route", "Source", "Count", "TTL")
        VALUES('${this.route}', '${key}', 1,
        ${(RateLimit && RateLimit.TTL) || ttl})
        ON CONFLICT("Route", "Source") DO UPDATE SET "Count"=1, "TTL"=${ttl}`,
      )
        .then(() => {
          cb(null, {
            current: 1,
            ttl: (RateLimit && RateLimit.TTL) || ttl,
          });
        })
        .catch(err => {
          cb(err, {
            current: 0,
          });
        });
    }
  };

  RateLimiterStore.prototype.child = function child(routeOptions = {}) {
    const options = Object.assign(this.options, routeOptions);
    const store = new RateLimiterStore(options);
    store.routeKey(routeOptions.routeInfo.method + routeOptions.routeInfo.url);
    return store;
  };

  return RateLimiterStore;
};

module.exports = {
  createRateLimiter,
};
