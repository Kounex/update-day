import { makeLines } from 'nodesplash';
import { readPackageSync } from 'read-pkg';

const logBanner = () => {
  console.log(
    makeLines({
      user: 'Kounex',
      repository: 'update-day',
      version: readPackageSync().version,
      buildDate: process.env.BUILD_DATE
        ? new Date(process.env.BUILD_DATE)
        : undefined,
      commit: process.env.COMMIT_HASH ?? 'unknown',
    }).join('\n')
  );
  console.log('\n');
};

export default logBanner;
