import { NodePHP } from '@php-wasm/node';
import {
	RecommendedPHPVersion,
	getWordPressModule,
} from '@wp-playground/wordpress';
import { importWxr } from './import-wxr';
import { readFile } from 'fs/promises';
import { unzip } from './unzip';
import { installPlugin } from './install-plugin';

describe('Blueprint step importWxr', () => {
	let php: NodePHP;
	beforeEach(async () => {
		php = await NodePHP.load(RecommendedPHPVersion, {
			requestHandler: {
				documentRoot: '/wordpress',
			},
		});

		await unzip(php, {
			zipFile: await getWordPressModule(),
			extractToPath: '/wordpress',
		});

		// Delete all posts
		await php.run({
			code: `<?php
			require '/wordpress/wp-load.php';
			$posts = get_posts();
			foreach ($posts as $post) {
				wp_delete_post($post->ID, true);
			}
			`,
		});

		// Install the WordPress importer plugin
		const pluginZipData = await readFile(
			__dirname + '/../../../../website/public/wordpress-importer.zip'
		);
		const pluginZipFile = new File([pluginZipData], 'plugin.zip');
		await installPlugin(php, {
			pluginZipFile,
		});
	});

	it('Should import a WXR file with JSON-encoded UTF-8 characters', async () => {
		const fileData = await readFile(
			__dirname + '/fixtures/import-wxr-slash-issue.xml'
		);
		const file = new File([fileData], 'import.wxr');

		await importWxr(php, { file });

		const expectedPostContent = `<!-- wp:inseri-core/text-editor {"blockId":"DSrQIjN5UjosCHJQImF5z","blockName":"textEditor","height":60,"content":"\\u0022#test\\u0022","contentType":"application/json"} -->
<div class="wp-block-inseri-core-text-editor" data-attributes="{&quot;blockId&quot;:&quot;DSrQIjN5UjosCHJQImF5z&quot;,&quot;blockName&quot;:&quot;textEditor&quot;,&quot;content&quot;:&quot;\\&quot;#test\\&quot;&quot;,&quot;contentType&quot;:&quot;application/json&quot;,&quot;editable&quot;:false,&quot;height&quot;:60,&quot;isVisible&quot;:true,&quot;label&quot;:&quot;&quot;}">is loading ...</div>
<!-- /wp:inseri-core/text-editor -->`;

		const result = await php.run({
			code: `<?php
			require getenv('DOCROOT') . '/wp-load.php';
			$posts = get_posts();
			echo json_encode([
				'post_content' => $posts[0]->post_content,
				'post_title' => $posts[0]->post_title,
			]);
			`,
			env: {
				DOCROOT: await php.documentRoot,
			},
		});
		const json = result.json;

		expect(json.post_content).toEqual(expectedPostContent);
		expect(json.post_title).toEqual(`"Issue\\Issue"`);
	});
});