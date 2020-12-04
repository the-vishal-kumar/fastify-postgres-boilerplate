const Acl = require('acl');
const AclMemoryRegexpBackend = require('acl-mem-regexp');
const { AppError } = require('../../../common/errors');
const { ROLES } = require('../../../core/user');

const acl = new Acl(new AclMemoryRegexpBackend()); // eslint-disable-line
const rolesResources = [
  {
    roles: [ROLES.admin],
    allows: [],
  },
  {
    roles: [ROLES.user],
    allows: [],
  },
];
acl.allow(rolesResources);

class ForbiddenError extends AppError {}

const checkPermisssion = (role, resource, permission) =>
  new Promise((resolve, reject) => {
    acl.areAnyRolesAllowed(role, resource, permission, (err, isAllowed) => {
      if (err) {
        const error = new ForbiddenError({
          details: err,
        });
        reject(error);
        return;
      }
      resolve(isAllowed);
    });
  });

module.exports = { checkPermisssion };
