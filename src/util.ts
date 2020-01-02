import * as http from "http";
import * as https from "https";
import * as fileType from "file-type";
import { Buffer } from "buffer";
import * as hasha from "hasha";
import { MatrixClient } from "matrix-bot-sdk";
import { Log } from "./log";
import * as request from "request-promise";

const log = new Log("Util");

const HTTP_OK = 200;

export interface IMakeUploadFileData {
	avatarUrl?: string | null;
	avatarBuffer?: Buffer | null;
}

export class Util {
	public static async DownloadFile(url: string, options: any = {}): Promise<Buffer> {
		if (!options.method) {
			options.method = "GET";
		}
		options.url = url;
		options.encoding = null;
		return await request(options);
	}

	public static GetMimeType(buffer: Buffer): string | undefined {
		const typeResult = fileType(buffer);
		if (!typeResult) {
			return undefined;
		}
		return typeResult.mime;
	}

	public static str2mxid(a: string): string {
		// tslint:disable:no-magic-numbers
		const buf = Buffer.from(a);
		let encoded = "";
		for (const b of buf) {
			if (b === 0x5F) {
				// underscore
				encoded += "__";
			} else if ((b >= 0x61 && b <= 0x7A) || (b >= 0x30 && b <= 0x39)) {
				// [a-z0-9]
				encoded += String.fromCharCode(b);
			} else if (b >= 0x41 && b <= 0x5A) {
				encoded += "_" + String.fromCharCode(b + 0x20);
			} else if (b < 16) {
				encoded += "=0" + b.toString(16);
			} else {
				encoded += "=" + b.toString(16);
			}
		}
		return encoded;
		// tslint:enable:no-magic-numbers
	}

	public static mxid2str(b: string): string {
		// tslint:disable:no-magic-numbers
		const decoded = Buffer.alloc(b.length);
		let j = 0;
		for (let i = 0; i < b.length; i++) {
			const char = b[i];
			if (char === "_") {
				i++;
				if (b[i] === "_") {
					decoded[j] = 0x5F;
				} else {
					decoded[j] = b[i].charCodeAt(0) - 0x20;
				}
			} else if (char === "=") {
				i++;
				decoded[j] = parseInt(b[i] + b[i + 1], 16);
				i++;
			} else {
				decoded[j] = b[i].charCodeAt(0);
			}
			j++;
		}
		return decoded.toString("utf8", 0, j);
		// tslint:enable:no-magic-numbers
	}

	public static async sleep(timeout: number): Promise<void> {
		return new Promise((resolve, reject) => {
			setTimeout(resolve, timeout);
		});
	}

	public static async AsyncForEach(arr, callback) {
		for (let i = 0; i < arr.length; i++) {
			await callback(arr[i], i, arr);
		}
	}

	public static async MaybeUploadFile(
		client: MatrixClient,
		data: IMakeUploadFileData,
		oldHash?: string | null,
	): Promise<{ doUpdate: boolean; mxcUrl: string|undefined; hash: string; }> {
		let buffer = data.avatarBuffer;
		if ((!buffer && !data.avatarUrl) || (buffer && buffer.byteLength === 0)) {
			// we need to remove the avatar, short-circuit out of here
			return {
				doUpdate: true,
				mxcUrl: undefined,
				hash: "",
			};
		}
		try {
			log.silly(data.avatarUrl);
			if (!buffer) {
				log.silly("fetching avatar...");
				buffer = await Util.DownloadFile(data.avatarUrl!);
				log.silly("avatar fetched!");
			}
			const hash = hasha(buffer!, {
				algorithm: "sha512",
			});
			if (hash === oldHash) {
				// image didn't change, short-circuit out of here
				return {
					doUpdate: false,
					mxcUrl: undefined,
					hash,
				};
			}

			let filename = "remote_avatar";
			if (data.avatarUrl) {
				const matches = data.avatarUrl.match(/\/([^\.\/]+\.[a-zA-Z0-9]+)(?:$|\?)/);
				if (matches) {
					filename = matches[1];
				}
			}
			const avatarMxc = await client!.uploadContent(
				buffer,
				Util.GetMimeType(buffer),
				filename,
			);
			return {
				doUpdate: true,
				mxcUrl: avatarMxc,
				hash,
			};
		} catch (err) {
			log.error("Error uploading file content:", err);
			return {
				doUpdate: false,
				mxcUrl: undefined,
				hash: "",
			};
		}
	}
}
