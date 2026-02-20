"use client";

import { useState } from "react";
import Image from "next/image";

interface CoverImageProps {
    folderName: string;
    title: string;
    className?: string;
    /** Fill mode: image fills the container. Default is intrinsic (auto height). */
    fill?: boolean;
}

export function CoverImage({ folderName, title, className = "", fill = false }: CoverImageProps) {
    const [error, setError] = useState(false);
    const src = `/covers/${encodeURIComponent(folderName)}.png`;

    if (error) {
        return (
            <div
                className={`cover-placeholder flex items-center justify-center ${className}`}
                style={fill ? { position: "absolute", inset: 0 } : { minHeight: 200 }}
            >
                <div className="text-center text-muted-foreground">
                    <div className="text-3xl mb-1">📄</div>
                    <div className="text-xs">暂无封面</div>
                </div>
            </div>
        );
    }

    if (fill) {
        return (
            <Image
                src={src}
                alt={title}
                fill
                className={`object-cover object-top ${className}`}
                sizes="(max-width: 768px) 50vw, 25vw"
                onError={() => setError(true)}
            />
        );
    }

    return (
        <Image
            src={src}
            alt={title}
            width={600}
            height={800}
            className={`w-full h-auto ${className}`}
            onError={() => setError(true)}
        />
    );
}
