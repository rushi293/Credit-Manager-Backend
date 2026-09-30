import { Request, Response } from 'express';
import prisma from '../utils/db';
import cloudinary from '../utils/cloudinary';

export const uploadAttachment = async (req: Request, res: Response) => {
  try {
    const businessId = req.businessId!;
    const { billId } = req.params;

    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded' });
    }

    // Verify bill belongs to business
    const bill = await prisma.creditBill.findFirst({
      where: { id: billId, businessId }
    });

    if (!bill) {
      return res.status(404).json({ success: false, error: 'Bill not found' });
    }

    // Upload to Cloudinary using a stream since file is in memory
    const uploadResult = await new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: `credit-manager/${businessId}`,
          resource_type: 'auto' // Handle images automatically
        },
        (error, result) => {
          if (error) return reject(error);
          resolve(result);
        }
      );
      uploadStream.end(req.file!.buffer);
    });

    const cloudinaryResult = uploadResult as any;

    const attachment = await prisma.billAttachment.create({
      data: {
        creditBillId: billId,
        fileName: req.file.originalname,
        mimeType: req.file.mimetype,
        fileUrl: cloudinaryResult.secure_url,
      }
    });

    res.status(201).json({ success: true, data: attachment });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message || 'Failed to upload image to Cloudinary. Please check configuration.' });
  }
};

export const getAttachmentFile = async (req: Request, res: Response) => {
  try {
    const businessId = req.businessId!;
    const { id } = req.params;

    const attachment = await prisma.billAttachment.findUnique({
      where: { id },
      include: {
        creditBill: { select: { businessId: true } }
      }
    });

    if (!attachment || attachment.creditBill.businessId !== businessId) {
      return res.status(404).json({ success: false, error: 'Attachment not found' });
    }

    // If it's an old local file, it won't be a valid URL.
    if (!attachment.fileUrl.startsWith('http')) {
      return res.status(404).json({ success: false, error: 'File not found on Cloudinary (old local file)' });
    }

    // Redirect to the Cloudinary URL
    res.redirect(attachment.fileUrl);
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// Helper to extract Cloudinary public_id from URL
export const extractPublicId = (url: string) => {
  try {
    const parts = url.split('/');
    const fileWithExt = parts[parts.length - 1];
    const folder = parts[parts.length - 2];
    const rootFolder = parts[parts.length - 3];
    const fileName = fileWithExt.split('.')[0];
    return `${rootFolder}/${folder}/${fileName}`;
  } catch (e) {
    return null;
  }
};

export const deleteAttachment = async (req: Request, res: Response) => {
  try {
    const businessId = req.businessId!;
    const { id } = req.params;

    const attachment = await prisma.billAttachment.findUnique({
      where: { id },
      include: {
        creditBill: { select: { businessId: true } }
      }
    });

    if (!attachment || attachment.creditBill.businessId !== businessId) {
      return res.status(404).json({ success: false, error: 'Attachment not found' });
    }

    await prisma.billAttachment.delete({ where: { id } });

    if (attachment.fileUrl.startsWith('http')) {
      const publicId = extractPublicId(attachment.fileUrl);
      if (publicId) {
        await cloudinary.uploader.destroy(publicId);
      }
    }

    res.json({ success: true, data: { deleted: true } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};
