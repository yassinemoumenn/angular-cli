/**
 * @license
 * Copyright Google Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */
// tslint:disable:no-implicit-dependencies
import { logging, tags } from '@angular-devkit/core';
import { spawnSync } from 'child_process';
import { packages } from '../lib/packages';
import build from './build';


export interface PublishArgs {
  tag?: string;
  branchCheck?: boolean;
}


function _exec(command: string, args: string[], opts: { cwd?: string }, logger: logging.Logger) {
  const { status, error, stderr, stdout } = spawnSync(command, args, { ...opts });

  if (status != 0) {
    logger.error(`Command failed: ${command} ${args.map(x => JSON.stringify(x)).join(', ')}`);
    if (error) {
      logger.error('Error: ' + (error ? error.message : 'undefined'));
    } else {
      logger.error(`STDERR:\n${stderr}`);
    }
    throw error;
  } else {
    return stdout.toString();
  }
}


function _branchCheck(args: PublishArgs, logger: logging.Logger) {
  logger.info('Checking branch...');
  const ref = _exec('git', ['symbolic-ref', 'HEAD'], {}, logger);
  const branch = ref.trim().replace(/^refs\/heads\//, '');

  switch (branch) {
    case 'master':
      if (args.tag !== 'next') {
        throw new Error(tags.oneLine`
          Releasing from master requires a next tag. Use --branchCheck=false to skip this check.
        `);
      }
  }
}


export default async function (args: PublishArgs, logger: logging.Logger) {
  if (args.branchCheck === undefined || args.branchCheck === true) {
    _branchCheck(args, logger);
  }


  logger.info('Building...');
  await build({}, logger.createChild('build'));

  return Object.keys(packages).reduce((acc: Promise<void>, name: string) => {
    const pkg = packages[name];
    if (pkg.packageJson['private']) {
      logger.debug(`${name} (private)`);

      return acc;
    }

    return acc
      .then(() => {
        logger.info(name);

        return _exec('npm', ['publish'].concat(args.tag ? ['--tag', args.tag] : []), {
          cwd: pkg.dist,
        }, logger);
      })
      .then((stdout: string) => {
        logger.info(stdout);
      });
  }, Promise.resolve())
  .then(() => logger.info('done'), (err: Error) => logger.fatal(err.message));
}
