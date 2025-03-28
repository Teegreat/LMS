import { Request, Response } from "express";
import Course from "../models/courseModel";
import AWS from "aws-sdk";
import { v4 as uuidv4 } from "uuid";
import { getAuth } from "@clerk/express";

const s3 = new AWS.S3();

export const listCourses = async (
  req: Request,
  res: Response
): Promise<void> => {
  const { category } = req.query;
  try {
    const courses =
      category && category !== "all"
        ? await Course.scan("category").eq(category).exec()
        : await Course.scan().exec();
    res.json({ message: "Courses retrieved successfully", data: courses });
  } catch (error) {
    res.status(500).json({ message: "Error retrieving courses", error });
  }
};

export const getCourse = async (req: Request, res: Response): Promise<void> => {
  const { courseId } = req.params;
  try {
    const course = await Course.get(courseId);
    if (!course) {
      res.status(404).json({ message: "Course not found" });
      return;
    }

    res.json({ message: "Course retrieved successfully", data: course });
  } catch (error) {
    res.status(500).json({ message: "Error retrieving course", error });
  }
};

export const createCourse = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { teacherId, teacherName } = req.body;

    if (!teacherId || !teacherName) {
      res.status(400).json({ message: "Teacher Id and name are required" });
      return;
    }

    const newCourse = new Course({
      courseId: uuidv4(),
      teacherId,
      teacherName,
      title: "Untitled Course",
      description: "",
      category: "Uncategorized",
      image: "",
      price: 0,
      level: "Beginner",
      status: "Draft",
      sections: [],
      enrollments: [],
    });
    await newCourse.save();

    res.json({ message: "Course created successfully", data: newCourse });
  } catch (error) {
    res.status(500).json({ message: "Error creating course", error });
  }
};

export const updateCourse = async (
  req: Request,
  res: Response
): Promise<void> => {
  const { courseId } = req.params;
  const updateData = { ...req.body };
  const { userId } = getAuth(req);

  try {
    const course = await Course.get(courseId);
    if (!course) {
      res.status(404).json({ message: "Course not found" });
      return;
    }

    if (course.teacherId !== userId) {
      res
        .status(403)
        .json({ message: "Not authorized to update this course " });
      return;
    }

    if (updateData.price) {
      const price = parseInt(updateData.price);
      if (isNaN(price)) {
        res.status(400).json({
          message: "Invalid price format",
          error: "Price must be a valid number",
        });
        return;
      }
      updateData.price = price * 100;
    }

    if (updateData.sections) {
      const sectionsData =
        typeof updateData.sections === "string"
          ? JSON.parse(updateData.sections)
          : updateData.sections;

      updateData.sections = sectionsData.map((section: any) => ({
        ...section,
        sectionId: section.sectionId || uuidv4(),
        chapters: section.chapters.map((chapter: any) => ({
          ...chapter,
          chapterId: chapter.chapterId || uuidv4(),
        })),
      }));
    }

    Object.assign(course, updateData);
    await course.save();

    res.json({ message: "Course updated successfully", data: course });
  } catch (error) {
    res.status(500).json({ message: "Error updating course", error });
  }
};

export const deleteCourse = async (
  req: Request,
  res: Response
): Promise<void> => {
  const { courseId } = req.params;
  const { userId } = getAuth(req);

  try {
    const course = await Course.get(courseId);
    if (!course) {
      res.status(404).json({ message: "Course not found" });
      return;
    }

    if (course.teacherId !== userId) {
      res
        .status(403)
        .json({ message: "Not authorized to delete this course " });
      return;
    }

    await Course.delete(courseId);

    res.json({ message: "Course deleted successfully", data: course });
  } catch (error) {
    res.status(500).json({ message: "Error deleting course", error });
  }
};

export const getUploadVideoUrl = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    // Comprehensive request logging
    // console.log(
    //   JSON.stringify({
    //     event: "uploadVideoUrlRequest",
    //     requestBody: req.body,
    //     requestHeaders: req.headers,
    //     requestMethod: req.method,
    //     requestPath: req.path,
    //     timestamp: new Date().toISOString(),
    //   })
    // );

    const { fileName, fileType } = req.body;

    if (!fileName || !fileType) {
      console.error("Validation Error: Missing fileName or fileType", {
        fileName,
        fileType,
      });
      res.status(400).json({ message: "File name and type are required" });
      return;
    }

    // Detailed environment variable logging
    // console.log(
    //   JSON.stringify({
    //     event: "environmentVariables",
    //     S3_BUCKET_NAME: process.env.S3_BUCKET_NAME,
    //     CLOUDFRONT_DOMAIN: process.env.CLOUDFRONT_DOMAIN,
    //     NODE_ENV: process.env.NODE_ENV,
    //   })
    // );

    const uniqueId = uuidv4();
    const s3Key = `videos/${uniqueId}/${fileName}`;

    // Possible fix for missing S3_BUCKET_NAME
    if (!process.env.S3_BUCKET_NAME) {
      throw new Error("S3_BUCKET_NAME is not configured");
    }

    const s3Params = {
      Bucket: process.env.S3_BUCKET_NAME,
      Key: s3Key,
      Expires: 60,
      ContentType: fileType,
    };

    try {
      const uploadUrl = s3.getSignedUrl("putObject", s3Params);
      const videoUrl = `${process.env.CLOUDFRONT_DOMAIN}/videos/${uniqueId}/${fileName}`;

      res.json({
        message: "Upload URL generated successfully",
        data: {
          uploadUrl,
          videoUrl,
          // s3Key,
          // bucketName: process.env.S3_BUCKET_NAME,
        },
      });
    } catch (s3Error) {
      console.error("S3 URL Generation Error", {
        error: s3Error,
        s3Params,
        stack: s3Error instanceof Error ? s3Error.stack : "No stack trace",
      });
      throw s3Error;
    }
  } catch (error) {
    console.error("Unexpected Error in getUploadVideoUrl", {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : "No stack trace",
      requestBody: req.body,
    });

    res.status(500).json({
      message: "Error generating upload URL",
      error: error instanceof Error ? error.message : String(error),
    });
  }
};

