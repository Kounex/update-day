import { makeLines } from 'nodesplash';
import { readPackageSync } from 'read-pkg';

// Only a real date - CI may pass something else (e.g. a run id).
const buildDate = (): Date | undefined => {
  const date = new Date(process.env.BUILD_DATE ?? '');
  return Number.isNaN(date.getTime()) ? undefined : date;
};

const logBanner = () => {
  console.log(
    makeLines({
      user: 'Kounex',
      repository: 'update-day',
      version: readPackageSync().version,
      buildDate: buildDate(),
      commit: process.env.COMMIT_HASH ?? 'unknown',
    }).join('\n')
  );
  console.log('\n');
};

export default logBanner;
