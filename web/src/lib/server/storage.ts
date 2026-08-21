import { S3Client, CreateBucketCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { env } from '$env/dynamic/private';

let client: S3Client | undefined;

// Importing this module has to stay side-effect free: SvelteKit's postbuild
// analyse pass imports every server module, so validating the environment at the
// top level fails `vite build` wherever S3 isn't configured. Defer both the
// checks and the client until something actually talks to S3.
function s3(): S3Client {
	if (client) return client;

	if (!env.S3_ENDPOINT) throw new Error('S3_ENDPOINT is not set');
	if (!env.S3_ACCESS_KEY) throw new Error('S3_ACCESS_KEY is not set');
	if (!env.S3_SECRET_KEY) throw new Error('S3_SECRET_KEY is not set');

	client = new S3Client({
		endpoint: env.S3_ENDPOINT,
		region: 'us-east-1',
		credentials: {
			accessKeyId: env.S3_ACCESS_KEY,
			secretAccessKey: env.S3_SECRET_KEY
		},
		forcePathStyle: true
	});

	return client;
}

export async function ensureBucket(bucket: string): Promise<void> {
	try {
		await s3().send(new CreateBucketCommand({ Bucket: bucket }));
	} catch (err: unknown) {
		const code = (err as { Code?: string; name?: string }).Code ?? (err as { name?: string }).name;
		if (code !== 'BucketAlreadyOwnedByYou' && code !== 'BucketAlreadyExists') throw err;
	}
}

export async function uploadFile(
	bucket: string,
	key: string,
	body: ArrayBuffer,
	contentType: string
): Promise<void> {
	await s3().send(
		new PutObjectCommand({
			Bucket: bucket,
			Key: key,
			Body: new Uint8Array(body),
			ContentType: contentType
		})
	);
}
