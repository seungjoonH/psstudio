// 로컬 개발용 초기 시드 데이터를 만드는 스크립트입니다.
import { dataSource } from "../src/config/data-source.js";
import { Group } from "../src/modules/groups/group.entity.js";
import { GroupMember } from "../src/modules/groups/group-member.entity.js";
import { User } from "../src/modules/users/user.entity.js";

async function main() {
  await dataSource.initialize();

  const userRepo = dataSource.getRepository(User);
  const groupRepo = dataSource.getRepository(Group);
  const memberRepo = dataSource.getRepository(GroupMember);

  let user = await userRepo.findOne({
    where: { provider: "google", providerUserId: "dev-seed" },
  });
  if (user === null) {
    user = userRepo.create({
      provider: "google",
      providerUserId: "dev-seed",
      email: "dev-seed@example.com",
      nickname: "데모 사용자",
      profileImageUrl: "https://avatars.githubusercontent.com/u/0",
    });
    user = await userRepo.save(user);
  }

  let group = await groupRepo.findOne({ where: { name: "데모 스터디" } });
  if (group === null) {
    group = groupRepo.create({ name: "데모 스터디", ownerUserId: user.id });
    group = await groupRepo.save(group);
    await memberRepo.save(memberRepo.create({ groupId: group.id, userId: user.id, role: "OWNER" }));
  }

  console.log("seed:dev ok", { userId: user.id, groupId: group.id });
  await dataSource.destroy();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
