// Models that hold per-user data. Each has a `user` field holding the DBI user id (ObjectId).
// Later phases register theirs here, so "delete all my data" always removes everything a user owns.
const userOwnedModels = [];

export const registerUserOwnedModel = (model) => {
  if (!userOwnedModels.includes(model)) userOwnedModels.push(model);
};

export const deleteUserData = async (userId) => {
  await Promise.all(userOwnedModels.map((model) => model.deleteMany({ user: userId })));
};
