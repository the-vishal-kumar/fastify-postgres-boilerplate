const createGetUsers = ({
  sequelize: {
    models: { User },
  },
}) => {
  const getUsers = async ({ page, perPage, sort, orderBy }) => {
    const offset = (page - 1) * perPage;
    const limit = perPage;

    return User.findAndCountAll({
      raw: true,
      limit,
      offset,
      order: [
        [sort, orderBy],
        ['email', 'desc'],
      ],
    });
  };

  return getUsers;
};

module.exports = { createGetUsers };
